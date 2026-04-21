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

load_dotenv("../.env")
app = FastAPI()

# Database Setup
conn = sqlite3.connect("feed.db")
conn.execute("CREATE TABLE IF NOT EXISTS feed_hooks (id INTEGER PRIMARY KEY, book_id TEXT, hook TEXT, paragraph TEXT, anchor_text TEXT)")
conn.commit()
conn.close()

pipeline_options = PdfPipelineOptions()
pipeline_options.generate_picture_images = True
converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

def internalHeuristicGenerator(paragraph: str, paragraph_id: str):
    """
    Standardized Internal Heuristic Generator: Extracts the best sentence based on scoring logic.
    """
    # Simple sentence splitter: look for ., ! or ? followed by space or newline
    sentences = re.split(r'(?<=[.!?])\s+', paragraph)
    if not sentences:
        return {"hook": paragraph[:100], "paragraph": paragraph, "paragraph_id": paragraph_id}
        
    best_sentence = sentences[0]
    max_score = -1
    
    keywords = ['never', 'always', 'secret', 'imagine', 'true', 'reasons', 'impossible', 'truth']
    
    for sentence in sentences:
        score = 0
        if '?' in sentence:
            score += 10
        if '!' in sentence:
            score += 5
        
        words = sentence.split()
        if 8 <= len(words) <= 20:
            score += 5
            
        lower_sentence = sentence.lower()
        if any(kw in lower_sentence for kw in keywords):
            score += 3
            
        # Default: If no score (all -1 or 0), first sentence remains best
        if score > max_score:
            max_score = score
            best_sentence = sentence
            
    return {
        "hook": best_sentence.strip(),
        "paragraph": paragraph.strip(),
        "paragraph_id": paragraph_id
    }

def generate_hooks_bg(book_id: str, markdown_text: str):
    print(f"Starting Background AI Parsing for {book_id}...")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("No GEMINI_API_KEY found, skipping background feed generation.")
        return

    client = genai.Client(api_key=api_key)
    prompt = """You are a viral content curator. Read this book text and extract exactly 5 highly engaging, insightful hooks. For each hook, provide the full structured paragraph it came from, and the EXACT first 30 characters of that original paragraph as 'anchor_text'. 

Format strictly as JSON array of objects:
[
  {"hook": "...", "paragraph": "...", "anchor_text": "..."}
]

Text:
""" + markdown_text[:80000]

    try:
        # Step A: Primary - Execute Gemini API call (gemini-flash) with retry/backoff logic
        max_retries = 4
        success = False
        data = []

        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model='gemini-1.5-flash',
                    contents=prompt,
                )
                raw = response.text.replace("```json", "").replace("```", "").strip()
                data = json.loads(raw)
                success = True
                print(f"Step A Success: AI generated {len(data)} hooks.")
                break
            except Exception as e:
                error_str = str(e)
                # Handle model naming inconsistencies if needed
                if "404" in error_str and "gemini-1.5-flash" in error_str:
                    print("Falling back to auto-detected flash model...")
                    models = client.models.list()
                    fallback = next((m.name for m in models if 'flash' in m.name), 'models/gemini-pro')
                    response = client.models.generate_content(
                        model=fallback.replace("models/", ""),
                        contents=prompt,
                    )
                    raw = response.text.replace("```json", "").replace("```", "").strip()
                    data = json.loads(raw)
                    success = True
                    break

                if ("503" in error_str or "429" in error_str) and attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + 2
                    print(f"API Capacity Error ({error_str[:3]}). Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"Step A Failed: {error_str}")
                    break
        
        # Step B: Fallback - If API call fails, immediate call internalHeuristicGenerator
        if not success:
            print("Executing Step B: Graceful Degradation to Internal Heuristic Generator...")
            # Split markdown into paragraphs (double newline)
            paragraphs = [p.strip() for p in markdown_text.split('\n\n') if len(p.strip()) > 50]
            # Take top 5 candidates for variety
            candidates = paragraphs[:5]
            data = []
            for p in candidates:
                result = internalHeuristicGenerator(p, book_id)
                # Format for DB consistency (mapping paragraph_id/book_id and generating anchor_text)
                data.append({
                    "hook": result["hook"],
                    "paragraph": result["paragraph"],
                    "anchor_text": result["paragraph"][:30].strip()
                })
            print(f"Step B Success: Generated {len(data)} heuristic hooks.")

        # Step C: Persistence - Save the resulting JSON object into the FeedHooks collection
        if data:
            conn = sqlite3.connect('feed.db')
            c = conn.cursor()
            for item in data:
                c.execute('''
                    INSERT INTO feed_hooks (book_id, hook, paragraph, anchor_text)
                    VALUES (?, ?, ?, ?)
                ''', (book_id, item['hook'], item['paragraph'], item['anchor_text']))
            conn.commit()
            conn.close()
            print(f"Step C Success: Saved hooks for {book_id} to database.")
        
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
            for item, level in result.document.iterate_items():
                if hasattr(item, "text") and item.text:
                    if hasattr(item, "prov") and item.prov and len(item.prov) > 0:
                        page_no = item.prov[0].page_no
                        if str(page_no) not in page_anchors:
                            page_anchors[str(page_no)] = item.text[:30].strip()
        except:
            pass
            
        # Dispatch AI thread to not block the reader
        background_tasks.add_task(generate_hooks_bg, book_id, md_text)
        
    except Exception as e:
        md_text = f"Docling Extraction Error: {e}"
        page_anchors = {}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"text": md_text, "page_anchors": page_anchors}

@app.get("/feed")
def get_feed():
    with sqlite3.connect("feed.db") as c:
        c.row_factory = sqlite3.Row
        rows = c.execute("SELECT * FROM feed_hooks").fetchall()
        return [{"id": r["id"], "book_id": r["book_id"], "hook": r["hook"], "paragraph": r["paragraph"], "anchor_text": r["anchor_text"]} for r in rows]
