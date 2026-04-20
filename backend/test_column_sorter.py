import fitz
from collections import defaultdict

def test_columns(pdf_path):
    print(f"Loading {pdf_path}...")
    doc = fitz.open(pdf_path)
    
    # We will grab page 2 to test standard text columns
    page = doc.load_page(1)
    blocks = page.get_text("blocks") # Not using sort=True to get raw structure mapping
    
    # Exclude noise heuristic temporarily...
    
    text_blocks = [b for b in blocks if b[6] == 0]
    
    # User's Request: 
    # 1. Detect bounding box.
    # 2. Sort by x-coordinate (column order).
    # 3. Within column, sort by y-coordinate (top-down).
    
    # If we strictly sort by raw x0, a slight indent creates a "new column". We need to bin/cluster the x coordinates.
    # Let's define a tolerance for column clustering, e.g., 50 pixels.
    columns = []
    TOLERANCE = 100
    
    for b in text_blocks:
        x0 = b[0]
        y0 = b[1]
        text = b[4].strip()
        
        # Skip small noise or empty text
        if len(text) < 2:
            continue
            
        # Find which column bin this belongs to based on x0
        matched_col = None
        for col in columns:
            col_x_avg = sum(bz[0] for bz in col) / len(col)
            if abs(x0 - col_x_avg) < TOLERANCE:
                matched_col = col
                break
        
        if matched_col is not None:
            matched_col.append((x0, y0, text))
        else:
            columns.append([(x0, y0, text)])

    # 1. Sort the columns themselves left-to-right by their average x0 coordinate
    columns.sort(key=lambda col: sum(bz[0] for bz in col) / len(col))
    
    # 2. Inside each column, sort the blocks top-to-bottom by y0 coordinate
    print(f"Found {len(columns)} spatial columns!")
    
    for i, col in enumerate(columns):
        print(f"\n--- COLUMN {i + 1} ---")
        col.sort(key=lambda b: b[1]) # Sort by y0
        
        for idx, block in enumerate(col[:4]): # print first few items per column
            clean_text = block[2][:60].replace('\n', ' ')
            print(f"  [y={block[1]:.1f}] {clean_text}")

if __name__ == "__main__":
    test_columns("/Users/pritammitra/Desktop/Book-Test.pdf")
