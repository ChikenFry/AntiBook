import os
import re
import sqlite3
import json

# Import the logic directly for testing
def internalHeuristicGenerator(paragraph: str, paragraph_id: str):
    sentences = re.split(r'(?<=[.!?])\s+', paragraph)
    if not sentences:
        return {"hook": paragraph[:100], "paragraph": paragraph, "paragraph_id": paragraph_id}
        
    best_sentence = sentences[0]
    max_score = -1
    keywords = ['never', 'always', 'secret', 'imagine', 'true', 'reasons', 'impossible', 'truth']
    
    for sentence in sentences:
        score = 0
        if '?' in sentence: score += 10
        if '!' in sentence: score += 5
        words = sentence.split()
        if 8 <= len(words) <= 20: score += 5
        lower_sentence = sentence.lower()
        if any(kw in lower_sentence for kw in keywords): score += 3
        
        if score > max_score:
            max_score = score
            best_sentence = sentence
            
    return {
        "hook": best_sentence.strip(),
        "paragraph": paragraph.strip(),
        "paragraph_id": paragraph_id
    }

def test_heuristic():
    print("Testing Heuristic Generator...")
    
    # Test case 1: Question priority
    p1 = "This is a normal sentence. But is this a secret question that we should always imagine? It is true."
    res1 = internalHeuristicGenerator(p1, "book1")
    print(f"Test 1 (Question/Keywords): {res1['hook']}")
    assert "secret question" in res1['hook']
    assert "?" in res1['hook']
    
    # Test case 2: Exclamation priority
    p2 = "Hello world. This is amazing! Just some more text."
    res2 = internalHeuristicGenerator(p2, "book1")
    print(f"Test 2 (Exclamation): {res2['hook']}")
    assert "amazing!" in res2['hook']
    
    # Test case 3: Word length priority
    p3 = "Short. This sentence has exactly twelve words in it to satisfy the requirement. Very long sentence that goes on and on and on and on and on and on and on and on and on and on."
    res3 = internalHeuristicGenerator(p3, "book1")
    print(f"Test 3 (Length): {res3['hook']}")
    assert "exactly twelve words" in res3['hook']

    # Test case 4: Default to first sentence
    p4 = "The first sentence is standard. Second is also standard."
    res4 = internalHeuristicGenerator(p4, "book1")
    print(f"Test 4 (Default): {res4['hook']}")
    assert res4['hook'] == "The first sentence is standard."

    print("Heuristic Tests Passed!")

if __name__ == "__main__":
    test_heuristic()
