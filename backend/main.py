import os
import re
import json
import sqlite3
import tempfile
import time
from fastapi import FastAPI, File, UploadFile, BackgroundTasks, Form
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling_core.types.doc.base import ImageRefMode
from google import genai
from dotenv import load_dotenv
from docling.datamodel.document import TextItem, SectionHeaderItem, ListItem, TableItem, PictureItem

load_dotenv("../.env")
app = FastAPI()

# Manual Circuit Breaker: Set to True to bypass Gemini AI and use Heuristics exclusively
DISABLE_AI_FOR_FEED = True 

# Database Setup & Migration
conn = sqlite3.connect("feed.db")
conn.execute("CREATE TABLE IF NOT EXISTS feed_hooks (id INTEGER PRIMARY KEY, book_id TEXT, hook TEXT, paragraph TEXT, paragraph_id TEXT)")
# Migration: Add paragraph_id col if an older DB exists without it
try:
    conn.execute("ALTER TABLE feed_hooks ADD COLUMN paragraph_id TEXT")
except sqlite3.OperationalError:
    # Column already exists
    pass
conn.commit()
conn.close()

pipeline_options = PdfPipelineOptions()
pipeline_options.generate_picture_images = True
converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

def internalHeuristicGenerator(book_paragraphs: list, book_id: str, max_page: int):
    """
    Standardized Internal Heuristic Generator: Extracts the best sentence based on scoring logic.
    """
    if not book_paragraphs:
        return []
        
    # Filter: middle pages (avoid first 10% and last 10%)
    min_p = max(1, int(max_page * 0.1))
    max_p = int(max_page * 0.9)
    
    candidates = []
    for p in book_paragraphs:
        if min_p <= p["page_no"] <= max_p:
            if len(p["text"].split()) > 50:
                candidates.append(p)
                
    if not candidates:
        # Fallback if book is too short
        candidates = [p for p in book_paragraphs if len(p["text"].split()) > 20]
        if not candidates:
            candidates = book_paragraphs
            
    import random
    import re
    # Take random 5
    selected = random.sample(candidates, min(5, len(candidates)))
    
    data = []
    for p in selected:
        sentences = re.split(r'(?<=[.!?])\s+', p["text"])
        if not sentences:
            sentences = [p["text"]]
        
        # Pick a random line/sentence that isn't too short
        valid_sentences = [s for s in sentences if len(s.split()) > 4]
        if not valid_sentences:
            valid_sentences = sentences
            
        hook_text = random.choice(valid_sentences).strip()
        data.append({
            "hook": hook_text,
            "paragraph": p["text"].strip(),
            "paragraph_id": str(p["page_no"])
        })
    return data

def generate_hooks_bg(book_id: str, markdown_text: str, book_paragraphs: list, max_page: int):
    print(f"Starting Background AI Parsing for {book_id}...")
    
    # 1. Delete old hooks for this book
    try:
        conn = sqlite3.connect('feed.db')
        c = conn.cursor()
        c.execute('DELETE FROM feed_hooks WHERE book_id = ?', (book_id,))
        conn.commit()
        conn.close()
        print(f"Deleted old hooks for {book_id}")
    except Exception as e:
        print("Error deleting old hooks:", e)
        
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("No GEMINI_API_KEY found, skipping background feed generation.")
        return

    client = genai.Client(api_key=api_key)
    prompt = """You are a viral content curator. Read this book text and extract exactly 5 highly engaging, insightful hooks. For each hook, provide the full structured paragraph it came from, and the EXACT first 30 characters of that original paragraph as 'anchor_text'. 

Format strictly as JSON array of objects:
[
  {"hook": "...", "paragraph": "...", "paragraph_id": "..."}
]

Text:
""" + markdown_text[:80000]

    try:
        # Step A: Primary AI Path (Skip if circuit breaker is active)
        success = False
        data = []

        if not DISABLE_AI_FOR_FEED:
            max_retries = 4
            for attempt in range(max_retries):
                try:
                    response = client.models.generate_content(
                        model='gemini-3-flash',
                        contents=prompt,
                    )
                    raw = response.text.replace("```json", "").replace("```", "").strip()
                    data = json.loads(raw)
                    success = True
                    print(f"Step A Success: AI generated {len(data)} hooks using gemini-3-flash.")
                    break
                except Exception as e:
                    error_str = str(e)
                    # Handle model naming inconsistencies or fallback
                    if "404" in error_str:
                        print("gemini-3-flash not found or quota hit. Attempting fallback to other flash models...")
                        models = client.models.list()
                        available = [m.name for m in models]
                        print(f"Available: {available}")
                        fallback = next((m.name for m in models if 'flash' in m.name), 'models/gemini-1.5-flash')
                        try:
                            response = client.models.generate_content(
                                model=fallback.replace("models/", ""),
                                contents=prompt,
                            )
                            raw = response.text.replace("```json", "").replace("```", "").strip()
                            data = json.loads(raw)
                            success = True
                            print(f"Fallback Success: Used {fallback}")
                            break
                        except:
                            pass

                    if ("503" in error_str or "429" in error_str) and attempt < max_retries - 1:
                        wait_time = (2 ** attempt) + 2
                        print(f"API Capacity Error ({error_str[:3]}). Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                    else:
                        print(f"Step A Failed: {error_str}")
                        break
        else:
            print("Circuit Breaker Active: Skipping AI call.")
        
        # Step B: Fallback - If API call fails, immediate call internalHeuristicGenerator
        if not success:
            print("Executing Step B: Graceful Degradation to Internal Heuristic Generator...")
            data = internalHeuristicGenerator(book_paragraphs, book_id, max_page)
            print(f"Step B Success: Generated {len(data)} heuristic hooks.")

        # Step C: Persistence - Save outcomes into the FeedHooks collection using a unified JSON schema
        if data:
            conn = sqlite3.connect('feed.db')
            c = conn.cursor()
            for item in data:
                # Ensure we handle both potential key names during transition or extraction
                p_id = item.get('paragraph_id') or item.get('anchor_text') or item.get('paragraph', '')[:30].strip()
                c.execute('''
                    INSERT INTO feed_hooks (book_id, hook, paragraph, paragraph_id)
                    VALUES (?, ?, ?, ?)
                ''', (book_id, item['hook'], item['paragraph'], p_id))
            conn.commit()
            conn.close()
            print(f"Step C Success: Saved {len(data)} hooks for {book_id} to database.")
        
    except Exception as e:
        print(f"Pipeline Failure: {str(e)}")

@app.post("/extract")
async def extract_pdf(background_tasks: BackgroundTasks, book_id: str = Form(...), file: UploadFile = File(...)):
    contents = await file.read()
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = converter.convert(tmp_path)
        md_text = result.document.export_to_markdown(image_mode=ImageRefMode.EMBEDDED)
        
        page_anchors = {}
        try:
            # 1. Find max page
            max_page = 1
            for item, level in result.document.iterate_items():
                if hasattr(item, "prov") and item.prov and len(item.prov) > 0:
                    max_page = max(max_page, item.prov[0].page_no)

            # 2. Inject Page Markers into md_text
            page_markers = []
            marked_pages = set()
            book_paragraphs = []
            for item, level in result.document.iterate_items():
                # Skip headings, list items, tables, pictures — they don't become paragraphs
                if isinstance(item, (SectionHeaderItem, ListItem, TableItem, PictureItem)):
                    continue

                if hasattr(item, "text") and item.text and item.text.strip():
                    if hasattr(item, "prov") and item.prov and len(item.prov) > 0:
                        page_no = item.prov[0].page_no

                        book_paragraphs.append({
                            "text": item.text,
                            "page_no": page_no
                        })

                        if page_no not in marked_pages:
                            # Try decreasing substring lengths — Docling's markdown export
                            # may escape or reformat characters, so shorter substrings are
                            # more likely to match verbatim.
                            raw = item.text.strip()
                            for length in [60, 40, 20, 10]:
                                if length > len(raw):
                                    continue
                                offset = md_text.find(raw[:length])
                                if offset != -1:
                                    page_markers.append({"page_no": page_no, "offset": offset})
                                    marked_pages.add(page_no)
                                    break

            # Sort markers descending so string injection doesn't mess up subsequent offsets
            page_markers.sort(key=lambda x: x["offset"], reverse=True)
            for marker in page_markers:
                offset = marker["offset"]
                p_no = marker["page_no"]
                md_text = md_text[:offset] + f"\n\n[%%%PAGE_{p_no}%%%]\n\n" + md_text[offset:]

            # 3. We no longer need page_anchors for the frontend! Keep an empty dict for DB compat.
            page_anchors = {}
        except Exception as e:
            max_page = 1
            book_paragraphs = []
            print("Anchor generation error:", e)
            
        # Dispatch AI thread to not block the reader
        background_tasks.add_task(generate_hooks_bg, book_id, md_text, book_paragraphs, max_page)
        
    except Exception as e:
        md_text = f"Docling Extraction Error: {e}"
        page_anchors = {}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"text": md_text, "page_anchors": page_anchors}

@app.get("/feed")
def get_feed():
    with sqlite3.connect("feed.db") as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        rows = c.execute("SELECT * FROM feed_hooks").fetchall()
        
        return [{
            "id": dict(r).get("id"),
            "book_id": dict(r).get("book_id"),
            "hook": dict(r).get("hook", "Hook pending..."),
            "paragraph": dict(r).get("paragraph", "Content unavailable."),
            "paragraph_id": dict(r).get("paragraph_id")
        } for r in rows]

@app.delete("/book/{book_id}")
def delete_book(book_id: str):
    try:
        conn = sqlite3.connect('feed.db')
        c = conn.cursor()
        c.execute('DELETE FROM feed_hooks WHERE book_id = ?', (book_id,))
        conn.commit()
        conn.close()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
