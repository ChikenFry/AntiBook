import React, { createContext, useContext, useState, ReactNode } from 'react';

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
  removeBook: (id: string) => void;
};

const LibraryContext = createContext<LibraryContextType>({
  books: [],
  addBook: () => {},
  updateBookText: () => {},
  removeBook: () => {},
});

export const useLibrary = () => useContext(LibraryContext);

export const LibraryProvider = ({ children }: { children: ReactNode }) => {
  const [books, setBooks] = useState<Book[]>([]);

  const addBook = (book: Book) => {
    setBooks(prev => [...prev, book]);
  };

  const updateBookText = (id: string, text: string, page_anchors?: Record<string, string>) => {
    setBooks(prev =>
      prev.map(b => (b.id === id ? { ...b, text, page_anchors } : b))
    );
  };

  const removeBook = (id: string) => {
    setBooks(prev => prev.filter(b => b.id !== id));
  };

  return (
    <LibraryContext.Provider value={{ books, addBook, updateBookText, removeBook }}>
      {children}
    </LibraryContext.Provider>
  );
};
