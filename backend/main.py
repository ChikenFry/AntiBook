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

def _is_body_paragraph(text: str) -> bool:
    """
    Returns True only for genuine narrative/body paragraphs.
    Rejects references, bibliographies, acknowledgments, indexes, captions,
    data-heavy tables, and other non-prose content.
    """
    t = text.strip()
    words = t.split()
    n = len(words)

    # Must be a substantial block of prose
    if n < 40:
        return False

    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', t) if len(s.split()) > 3]
    if len(sentences) < 2:
        return False

    lines = [l.strip() for l in t.splitlines() if l.strip()]

    # ── Reference / bibliography blocks ──────────────────────────────────
    # Lines like "[1] Smith..." or "1. Author..." signal a reference list
    ref_opener = re.compile(r'^(\[\d+\]|\d{1,3}[.)]\s+[A-Z])')
    ref_line_count = sum(1 for l in lines if ref_opener.match(l))
    if ref_line_count >= 2 or (lines and ref_line_count / len(lines) > 0.25):
        return False

    # Bibliography-style: "LastName, F. (YYYY)" or "LastName, F., & ..."
    if re.search(r'[A-Z][a-z]+,\s+[A-Z][\w.]*[\s,]+\(\d{4}\)', t):
        return False

    # Too many year-in-parentheses citations: (2019), (1998) etc.
    if len(re.findall(r'\(\d{4}[a-z]?\)', t)) >= 3:
        return False

    # Too many URLs or DOIs
    if len(re.findall(r'https?://|www\.|doi\.org', t)) >= 2:
        return False

    # ── Index / TOC lines ────────────────────────────────────────────────
    # "Some Topic . . . . 42" or "Some Topic, 45, 67"
    index_lines = sum(
        1 for l in lines
        if (re.search(r'\.{3,}|\s{3,}\d+$', l) or re.match(r'^[A-Za-z][^.!?]{0,40},\s*\d', l))
        and len(l.split()) < 10
    )
    if index_lines / max(1, len(lines)) > 0.3:
        return False

    # ── High digit density — data / statistics block ─────────────────────
    digit_chars = sum(c.isdigit() for c in t)
    if digit_chars / max(1, len(t)) > 0.12:
        return False

    # ── Name / title lists — high mid-sentence capitalisation ratio ───────
    mid_words = [w for w in words[1:] if len(w) > 2 and w.isalpha()]
    if mid_words:
        cap_ratio = sum(1 for w in mid_words if w[0].isupper()) / len(mid_words)
        if cap_ratio > 0.38:
            return False

    # ── Known non-body section openers ───────────────────────────────────
    first_100 = t[:120].lower()
    skip_markers = (
        'acknowledgment', 'acknowledgement', 'about the author', 'about the editor',
        "editor's note", 'note from the', 'foreword', 'preface by',
        'further reading', 'bibliography', 'selected bibliography',
        'notes and references', 'endnotes', 'suggested reading',
        'permissions', 'copyright ©', 'all rights reserved',
        'published by', 'printed in', 'isbn ', 'library of congress',
        'cataloging-in-publication', 'first published', 'originally published',
        'translated by', 'illustration credits', 'photo credits',
        'figure ', 'table ', 'exhibit ', 'appendix',
    )
    if any(marker in first_100 for marker in skip_markers):
        return False

    return True


def _score_hook_sentence(sentence: str) -> float:
    """
    Score a sentence on how compelling it is as a standalone hook.
    Higher = better hook candidate.
    """
    s = sentence.strip()
    words = s.split()
    n = len(words)
    if n < 5:
        return -99.0

    score = 0.0

    # Sweet spot: 8–20 words (punchy but complete)
    if 8 <= n <= 20:
        score += 4.0
    elif 5 <= n < 8 or 20 < n <= 28:
        score += 1.5
    else:
        score -= 1.5

    first = re.sub(r'[^a-z]', '', words[0].lower())

    # Penalise dangling pronoun openers — lose all context without surrounding paragraph
    if first in {'he', 'she', 'it', 'they', 'this', 'that', 'these', 'those',
                 'his', 'her', 'their', 'its', 'we', 'i', 'you', 'which', 'who'}:
        score -= 4.0

    # Penalise transition openers — not standalone
    if first in {'however', 'therefore', 'thus', 'moreover', 'furthermore',
                 'additionally', 'nevertheless', 'consequently', 'although',
                 'though', 'but', 'and', 'or', 'so', 'yet', 'also', 'still',
                 'besides', 'meanwhile', 'otherwise', 'indeed'}:
        score -= 3.0

    # Penalise numeric / bullet openers
    if words[0][0].isdigit() or words[0] in {'•', '-', '–', '—', '*', '·'}:
        score -= 3.0

    # Penalise URLs, citations, footnotes
    if re.search(r'https?://|www\.|\.com|\[\d+\]|\(\d{4}\)', s):
        score -= 5.0

    # Reward rhetorical questions — inherently engaging
    if s.endswith('?'):
        score += 2.5

    # Reward aphoristic declarative: short + ends with period
    if s.endswith('.') and n <= 18:
        score += 1.5

    # Reward nuanced punctuation that signals a well-formed thought
    if '—' in s or (':' in s and not s.endswith(':')):
        score += 1.0

    # Reward quoted speech or dialogue (adds voice)
    if re.search(r'["“”]', s) and n <= 30:
        score += 1.5

    # Reward high-signal vocabulary
    high_value = {
        'never', 'always', 'every', 'only', 'most', 'best', 'worst', 'greatest',
        'secret', 'truth', 'lie', 'mistake', 'success', 'failure', 'fear', 'love',
        'death', 'life', 'world', 'human', 'mind', 'power', 'freedom', 'knowledge',
        'change', 'create', 'discover', 'believe', 'understand', 'imagine', 'choose',
        'simple', 'impossible', 'extraordinary', 'remarkable', 'fundamental',
        'reason', 'purpose', 'meaning', 'matter', 'important', 'real', 'true',
        'wrong', 'right', 'problem', 'solution', 'question', 'answer', 'idea',
        'force', 'control', 'limit', 'overcome', 'resist', 'accept', 'demand',
    }
    lower = s.lower()
    hits = sum(1 for w in high_value if re.search(r'\b' + w + r'\b', lower))
    score += min(hits * 0.6, 2.4)

    # Penalise overly generic openers
    if first in {'the', 'a', 'an', 'in', 'at', 'on', 'by', 'for', 'with', 'as', 'from'}:
        score -= 0.5

    return score


# A hook must score at least this to be emitted — prevents padding with bad hooks
MIN_HOOK_SCORE = 3.0


def internalHeuristicGenerator(book_paragraphs: list, book_id: str, max_page: int):
    if not book_paragraphs:
        return []

    import random

    # Scale target with book length: ~1 hook per 3 pages, floor 5, ceiling 30
    n_target = max(5, min(30, max_page // 3))

    # Use the middle 80% — avoid front matter and bibliography
    min_p = max(1, int(max_page * 0.1))
    max_p = int(max_page * 0.9)

    # Primary pool: page range + paragraph quality filter
    pool = [
        p for p in book_paragraphs
        if min_p <= p["page_no"] <= max_p and _is_body_paragraph(p["text"])
    ]
    # Fallback 1: relax page range, keep quality filter
    if not pool:
        pool = [p for p in book_paragraphs if _is_body_paragraph(p["text"])]
    # Fallback 2: relax everything — any paragraph with 15+ words
    if not pool:
        pool = [p for p in book_paragraphs if len(p["text"].split()) > 15]
    if not pool:
        pool = book_paragraphs

    # Cap target to pool size so bands are never empty
    n_hooks = min(n_target, len(pool))
    band = max(1, len(pool) // n_hooks)

    results = []
    for i in range(n_hooks):
        start = i * band
        # Last band absorbs any leftover paragraphs
        end = (i + 1) * band if i < n_hooks - 1 else len(pool)
        section = pool[start:end] or pool

        # Sample half the section so repeated uploads produce variation
        sample = random.sample(section, min(len(section), max(1, len(section) // 2 + 1)))

        best_score = -999.0
        best_hook = None
        best_para = None

        for p in sample:
            sentences = re.split(r'(?<=[.!?])\s+', p["text"])
            for s in sentences:
                sc = _score_hook_sentence(s)
                if sc > best_score:
                    best_score = sc
                    best_hook = s.strip()
                    best_para = p

        # Only emit if quality clears the bar — no padding with bad hooks
        if best_hook and best_para and best_score >= MIN_HOOK_SCORE:
            results.append({
                "hook": best_hook,
                "paragraph": best_para["text"].strip(),
                "paragraph_id": str(best_para["page_no"])
            })

    print(f"Heuristic generator: target={n_target}, pool={len(pool)}, emitted={len(results)}")
    return results

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
