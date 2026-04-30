"""
Pure scoring / filtering / generation functions — no FastAPI or Docling imports.
Extracted here so they can be unit-tested without any heavy dependencies.
"""
import re
import random

MIN_HOOK_SCORE = 3.0


def _is_body_paragraph(text: str) -> bool:
    """
    Returns True only for genuine narrative/body paragraphs.
    Rejects references, bibliographies, acknowledgments, indexes, captions,
    data-heavy tables, and other non-prose content.
    """
    t = text.strip()
    words = t.split()
    n = len(words)

    if n < 40:
        return False

    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', t) if len(s.split()) > 3]
    if len(sentences) < 2:
        return False

    lines = [l.strip() for l in t.splitlines() if l.strip()]

    ref_opener = re.compile(r'^(\[\d+\]|\d{1,3}[.)]\s+[A-Z])')
    ref_line_count = sum(1 for l in lines if ref_opener.match(l))
    if ref_line_count >= 2 or (lines and ref_line_count / len(lines) > 0.25):
        return False

    if re.search(r'[A-Z][a-z]+,\s+[A-Z][\w.]*[\s,]+\(\d{4}\)', t):
        return False

    if len(re.findall(r'\(\d{4}[a-z]?\)', t)) >= 3:
        return False

    if len(re.findall(r'https?://|www\.|doi\.org', t)) >= 2:
        return False

    index_lines = sum(
        1 for l in lines
        if (re.search(r'\.{3,}|\s{3,}\d+$', l) or re.match(r'^[A-Za-z][^.!?]{0,40},\s*\d', l))
        and len(l.split()) < 10
    )
    if index_lines / max(1, len(lines)) > 0.3:
        return False

    digit_chars = sum(c.isdigit() for c in t)
    if digit_chars / max(1, len(t)) > 0.12:
        return False

    mid_words = [w for w in words[1:] if len(w) > 2 and w.isalpha()]
    if mid_words:
        cap_ratio = sum(1 for w in mid_words if w[0].isupper()) / len(mid_words)
        if cap_ratio > 0.38:
            return False

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

    if 8 <= n <= 20:
        score += 4.0
    elif 5 <= n < 8 or 20 < n <= 28:
        score += 1.5
    else:
        score -= 1.5

    first = re.sub(r'[^a-z]', '', words[0].lower())

    if first in {'he', 'she', 'it', 'they', 'this', 'that', 'these', 'those',
                 'his', 'her', 'their', 'its', 'we', 'i', 'you', 'which', 'who'}:
        score -= 4.0

    if first in {'however', 'therefore', 'thus', 'moreover', 'furthermore',
                 'additionally', 'nevertheless', 'consequently', 'although',
                 'though', 'but', 'and', 'or', 'so', 'yet', 'also', 'still',
                 'besides', 'meanwhile', 'otherwise', 'indeed'}:
        score -= 3.0

    if words[0][0].isdigit() or words[0] in {'•', '-', '–', '—', '*', '·'}:
        score -= 3.0

    if re.search(r'https?://|www\.|\.com|\[\d+\]|\(\d{4}\)', s):
        score -= 5.0

    if s.endswith('?'):
        score += 2.5

    if s.endswith('.') and n <= 18:
        score += 1.5

    if '—' in s or (':' in s and not s.endswith(':')):
        score += 1.0

    if re.search(r'["""]', s) and n <= 30:
        score += 1.5

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

    if first in {'the', 'a', 'an', 'in', 'at', 'on', 'by', 'for', 'with', 'as', 'from'}:
        score -= 0.5

    return score


def internalHeuristicGenerator(book_paragraphs: list, book_id: str, max_page: int) -> list:
    if not book_paragraphs:
        return []

    n_target = max(5, min(30, max_page // 3))

    min_p = max(1, int(max_page * 0.1))
    max_p = int(max_page * 0.9)

    pool = [
        p for p in book_paragraphs
        if min_p <= p["page_no"] <= max_p and _is_body_paragraph(p["text"])
    ]
    if not pool:
        pool = [p for p in book_paragraphs if _is_body_paragraph(p["text"])]
    if not pool:
        pool = [p for p in book_paragraphs if len(p["text"].split()) > 15]
    if not pool:
        pool = book_paragraphs

    n_hooks = min(n_target, len(pool))
    band = max(1, len(pool) // n_hooks)

    results = []
    for i in range(n_hooks):
        start = i * band
        end = (i + 1) * band if i < n_hooks - 1 else len(pool)
        section = pool[start:end] or pool
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

        if best_hook and best_para and best_score >= MIN_HOOK_SCORE:
            results.append({
                "hook": best_hook,
                "paragraph": best_para["text"].strip(),
                "paragraph_id": str(best_para["page_no"])
            })

    print(f"Heuristic generator: target={n_target}, pool={len(pool)}, emitted={len(results)}")
    return results
