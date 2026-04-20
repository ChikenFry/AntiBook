/**
 * Simple generator to parse raw text and return "Hooks" and "Paragraphs".
 * In a real app, this might use NLP or an LLM to find actually "catchy" lines.
 * For Step 1, we will split by paragraphs and pick the first sentence as the hook.
 */

export type FeedPost = {
  id: string;
  hook: string;
  paragraph: string;
};

export const generateFeedFromText = (rawText: string): FeedPost[] => {
  if (!rawText) return [];
  
  // Split by single newline first
  let paragraphs = rawText.split(/\n/).filter(p => p.trim().length > 50);
  
  // If the extractor completely failed to provide linebreaks, aggressively slice it
  if (paragraphs.length < 3 && rawText.length > 500) {
    const forced = [];
    let i = 0;
    while(i < rawText.length) {
      forced.push(rawText.substring(i, i + 500));
      i += 500;
    }
    paragraphs = forced;
  }
  
  return paragraphs.map((para, index) => {
    // Find the first sentence
    const match = para.match(/[^.!?]+[.!?]+/);
    const firstSentence = match ? match[0].trim() : para.substring(0, 80).trim() + "...";
    
    return {
      id: index.toString(),
      hook: firstSentence.length > 10 ? firstSentence : "Read more from this book...",
      paragraph: para.trim()
    };
  });
};
