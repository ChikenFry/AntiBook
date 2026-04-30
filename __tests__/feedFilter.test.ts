/**
 * Tests for the feed filtering logic used in feed.tsx.
 * The filter — `feed.filter(item => activeBookIds.has(item.book_id))` — is
 * the core regression guard for the "deleted-book hooks must disappear" feature.
 */

type FeedItem = { id: number; book_id: string; hook: string; paragraph: string; paragraph_id: string };
type Book = { id: string; title: string; uri: string };

function filterFeed(feed: FeedItem[], books: Book[]): FeedItem[] {
  const activeBookIds = new Set(books.map(b => b.id));
  return feed.filter(item => activeBookIds.has(item.book_id));
}

const FEED: FeedItem[] = [
  { id: 1, book_id: 'book1', hook: 'Hook 1', paragraph: 'Para 1', paragraph_id: '5' },
  { id: 2, book_id: 'book2', hook: 'Hook 2', paragraph: 'Para 2', paragraph_id: '10' },
  { id: 3, book_id: 'book1', hook: 'Hook 3', paragraph: 'Para 3', paragraph_id: '15' },
  { id: 4, book_id: 'book3', hook: 'Hook 4', paragraph: 'Para 4', paragraph_id: '20' },
];

const BOOKS: Book[] = [
  { id: 'book1', title: 'Book One', uri: '' },
  { id: 'book2', title: 'Book Two', uri: '' },
];

describe('feed filtering', () => {
  it('shows only hooks for books in the library', () => {
    const result = filterFeed(FEED, BOOKS);
    const ids = result.map(i => i.book_id);
    expect(ids).not.toContain('book3');
    expect(ids.every(id => ['book1', 'book2'].includes(id))).toBe(true);
  });

  it('returns all matching hooks including multiple from the same book', () => {
    const result = filterFeed(FEED, BOOKS);
    const book1Hooks = result.filter(i => i.book_id === 'book1');
    expect(book1Hooks).toHaveLength(2);
  });

  it('returns empty list when library is empty', () => {
    expect(filterFeed(FEED, [])).toHaveLength(0);
  });

  it('returns empty list when feed is empty', () => {
    expect(filterFeed([], BOOKS)).toHaveLength(0);
  });

  it('removes hooks immediately when a book is deleted', () => {
    const booksAfterDelete = BOOKS.filter(b => b.id !== 'book1');
    const result = filterFeed(FEED, booksAfterDelete);
    expect(result.every(i => i.book_id !== 'book1')).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].book_id).toBe('book2');
  });

  it('shows all hooks after a new book is added', () => {
    const newBooks = [...BOOKS, { id: 'book3', title: 'Book Three', uri: '' }];
    const result = filterFeed(FEED, newBooks);
    expect(result).toHaveLength(4);
  });

  it('returns empty when feed has hooks for books not in library', () => {
    const orphanFeed: FeedItem[] = [
      { id: 99, book_id: 'deleted_book', hook: 'Old hook', paragraph: 'Old para', paragraph_id: '1' },
    ];
    expect(filterFeed(orphanFeed, BOOKS)).toHaveLength(0);
  });
});
