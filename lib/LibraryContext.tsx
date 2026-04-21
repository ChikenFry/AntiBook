import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as FileSystem from 'expo-file-system';

export type Book = {
  id: string;
  title: string;
  uri: string;
  text?: string;
  page_anchors?: Record<string, string>;
};

type LibraryContextType = {
  books: Book[];
  addBook: (book: Book) => void;
  updateBookText: (id: string, text: string, page_anchors?: Record<string, string>) => void;
};

const LibraryContext = createContext<LibraryContextType>({
  books: [],
  addBook: () => {},
  updateBookText: () => {},
});

const BOOKS_FILE = FileSystem.documentDirectory + 'books.json';

async function loadBooksFromDisk(): Promise<Book[]> {
  try {
    const info = await FileSystem.getInfoAsync(BOOKS_FILE);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(BOOKS_FILE);
    return JSON.parse(raw) as Book[];
  } catch {
    return [];
  }
}

async function saveBooksToDisk(books: Book[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(BOOKS_FILE, JSON.stringify(books));
  } catch (e) {
    console.error('Failed to persist books:', e);
  }
}

export const useLibrary = () => useContext(LibraryContext);

export const LibraryProvider = ({ children }: { children: ReactNode }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load persisted books on mount
  useEffect(() => {
    loadBooksFromDisk().then(saved => {
      setBooks(saved);
      setLoaded(true);
    });
  }, []);

  // Persist books to disk whenever they change (after initial load)
  useEffect(() => {
    if (loaded) {
      saveBooksToDisk(books);
    }
  }, [books, loaded]);

  const addBook = (book: Book) => {
    setBooks(prev => [...prev, book]);
  };

  const updateBookText = (id: string, text: string, page_anchors?: Record<string, string>) => {
    setBooks(prev =>
      prev.map(b => (b.id === id ? { ...b, text, page_anchors } : b))
    );
  };

  return (
    <LibraryContext.Provider value={{ books, addBook, updateBookText }}>
      {children}
    </LibraryContext.Provider>
  );
};
