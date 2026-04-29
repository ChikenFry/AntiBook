import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Marker = {
  id: string;
  page: number;
  label: string;
};

export type Book = {
  id: string;
  title: string;
  uri: string;
  text?: string;
  page_anchors?: Record<string, string>;
  markers?: Marker[];
};

type LibraryContextType = {
  books: Book[];
  addBook: (book: Book) => void;
  updateBookText: (id: string, text: string, page_anchors?: Record<string, string>) => void;
  removeBook: (id: string) => void;
  addMarker: (bookId: string, marker: Omit<Marker, 'id'>) => void;
  removeMarker: (bookId: string, markerId: string) => void;
};

const LibraryContext = createContext<LibraryContextType>({
  books: [],
  addBook: () => {},
  updateBookText: () => {},
  removeBook: () => {},
  addMarker: () => {},
  removeMarker: () => {},
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

  const addMarker = (bookId: string, marker: Omit<Marker, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setBooks(prev =>
      prev.map(b =>
        b.id === bookId
          ? { ...b, markers: [...(b.markers || []), { ...marker, id }] }
          : b
      )
    );
  };

  const removeMarker = (bookId: string, markerId: string) => {
    setBooks(prev =>
      prev.map(b =>
        b.id === bookId
          ? { ...b, markers: (b.markers || []).filter(m => m.id !== markerId) }
          : b
      )
    );
  };

  return (
    <LibraryContext.Provider value={{ books, addBook, updateBookText, removeBook, addMarker, removeMarker }}>
      {children}
    </LibraryContext.Provider>
  );
};
