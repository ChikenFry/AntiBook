import fitz  # PyMuPDF
import sys

def test_extract(pdf_path):
    print(f"Loading {pdf_path}...")
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        print(f"Failed to open PDF: {e}")
        return

    # To detect noise (headers/footers), we can count occurrences of specific strings at the very top or bottom across multiple pages
    # For a simple heuristic: check the top 10% and bottom 10% of the first 5 pages.
    # If a text block matches exactly across them, add to noise set.
    
    first_few_pages = min(5, doc.page_count)
    potential_headers = []
    
    # Very naive heuristic for header/footer exact matching:
    for i in range(first_few_pages):
        page = doc.load_page(i)
        blocks = page.get_text("blocks")
        for b in blocks:
            # block_type == 0 means text
            if b[6] == 0:
                y0 = b[1]
                height = page.rect.height
                text = b[4].strip()
                # Check top 12% or bottom 12%
                if y0 < height * 0.12 or y0 > height * 0.88:
                    if len(text) > 0 and not text.isdigit():
                        potential_headers.append(text)
    
    from collections import Counter
    counts = Counter(potential_headers)
    print("Potential headers/footers found across first few pages:")
    for k, v in counts.items():
        if v > 1:
            print(f" - [{k}] (Occurred {v} times)")

    print("\nExtracting Page 1 with Layout Analysis...")
    page = doc.load_page(0)
    
    # "blocks" returns: (x0, y0, x1, y1, "text", block_no, block_type)
    # PyMuPDF naturally sorts blocks in reading order (top-down, left-to-right columns).
    blocks = page.get_text("blocks", sort=True)
    
    for idx, b in enumerate(blocks[:10]): # print first 10
        if b[6] == 0:  # text block
            text = b[4].strip()
            clean_text = text[:80].replace('\n', ' ')
            print(f"BLOCK {idx}: {clean_text}...")
            
if __name__ == "__main__":
    test_extract("/Users/pritammitra/Desktop/Book-Test.pdf")
