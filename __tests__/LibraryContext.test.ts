/**
 * Unit tests for LibraryContext state mutations.
 * Covers: addBook, removeBook, updateBookText, addMarker, removeMarker.
 */
import { renderHook, act } from '@testing-library/react-native';
import React from 'react';
import { LibraryProvider, useLibrary } from '../lib/LibraryContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(LibraryProvider, null, children);

// ─── addBook ────────────────────────────────────────────────────────────────

describe('addBook', () => {
  it('adds a book to an empty library', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'Dune', uri: 'file://dune.pdf' });
    });
    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].title).toBe('Dune');
  });

  it('accumulates multiple books', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'Book A', uri: 'a.pdf' });
      result.current.addBook({ id: '2', title: 'Book B', uri: 'b.pdf' });
    });
    expect(result.current.books).toHaveLength(2);
  });

  it('stores optional text and page_anchors as undefined initially', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'T', uri: 'u' });
    });
    expect(result.current.books[0].text).toBeUndefined();
    expect(result.current.books[0].page_anchors).toBeUndefined();
  });
});

// ─── removeBook ─────────────────────────────────────────────────────────────

describe('removeBook', () => {
  it('removes the correct book by id', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'Keep', uri: '' });
      result.current.addBook({ id: '2', title: 'Delete', uri: '' });
      result.current.removeBook('2');
    });
    expect(result.current.books).toHaveLength(1);
    expect(result.current.books[0].id).toBe('1');
  });

  it('is a no-op for an unknown id', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.removeBook('ghost');
    });
    expect(result.current.books).toHaveLength(1);
  });

  it('leaves an empty library when the only book is removed', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.removeBook('1');
    });
    expect(result.current.books).toHaveLength(0);
  });
});

// ─── updateBookText ──────────────────────────────────────────────────────────

describe('updateBookText', () => {
  it('sets text and page_anchors on the correct book', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.updateBookText('1', 'Hello World', { '5': 'offset_5' });
    });
    expect(result.current.books[0].text).toBe('Hello World');
    expect(result.current.books[0].page_anchors).toEqual({ '5': 'offset_5' });
  });

  it('does not affect other books', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addBook({ id: '2', title: 'B', uri: '' });
      result.current.updateBookText('1', 'Text for A', undefined);
    });
    expect(result.current.books[1].text).toBeUndefined();
  });

  it('accepts undefined page_anchors', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.updateBookText('1', 'Some text', undefined);
    });
    expect(result.current.books[0].text).toBe('Some text');
    expect(result.current.books[0].page_anchors).toBeUndefined();
  });
});

// ─── addMarker ───────────────────────────────────────────────────────────────

describe('addMarker', () => {
  it('adds a marker with generated id', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addMarker('1', { page: 7, label: 'Important' });
    });
    const markers = result.current.books[0].markers!;
    expect(markers).toHaveLength(1);
    expect(markers[0].page).toBe(7);
    expect(markers[0].label).toBe('Important');
    expect(typeof markers[0].id).toBe('string');
    expect(markers[0].id.length).toBeGreaterThan(0);
  });

  it('each marker gets a unique id', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addMarker('1', { page: 1, label: 'Marker 1' });
      result.current.addMarker('1', { page: 2, label: 'Marker 2' });
    });
    const markers = result.current.books[0].markers!;
    expect(markers).toHaveLength(2);
    expect(markers[0].id).not.toBe(markers[1].id);
  });

  it('uses default label naming convention when label is provided', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addMarker('1', { page: 3, label: 'Marker 1' });
    });
    expect(result.current.books[0].markers![0].label).toBe('Marker 1');
  });

  it('does not affect other books', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addBook({ id: '2', title: 'B', uri: '' });
      result.current.addMarker('1', { page: 5, label: 'M' });
    });
    expect(result.current.books[1].markers ?? []).toHaveLength(0);
  });
});

// ─── removeMarker ────────────────────────────────────────────────────────────

describe('removeMarker', () => {
  it('removes the correct marker by id', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addMarker('1', { page: 1, label: 'Keep' });
      result.current.addMarker('1', { page: 2, label: 'Delete' });
    });
    const deleteId = result.current.books[0].markers!.find(m => m.label === 'Delete')!.id;
    act(() => {
      result.current.removeMarker('1', deleteId);
    });
    const markers = result.current.books[0].markers!;
    expect(markers).toHaveLength(1);
    expect(markers[0].label).toBe('Keep');
  });

  it('is a no-op for an unknown marker id', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addMarker('1', { page: 1, label: 'M' });
      result.current.removeMarker('1', 'nonexistent');
    });
    expect(result.current.books[0].markers).toHaveLength(1);
  });

  it('leaves an empty markers array after last marker removed', () => {
    const { result } = renderHook(() => useLibrary(), { wrapper });
    act(() => {
      result.current.addBook({ id: '1', title: 'A', uri: '' });
      result.current.addMarker('1', { page: 5, label: 'Only' });
    });
    const mid = result.current.books[0].markers![0].id;
    act(() => {
      result.current.removeMarker('1', mid);
    });
    expect(result.current.books[0].markers).toHaveLength(0);
  });
});
