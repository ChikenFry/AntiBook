# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Does

A mobile reading app ("Scratch") that lets users upload PDFs, read them in a native PDF viewer or a clean markdown reader mode, and browse an AI-generated social feed of "hooks" — compelling excerpts surfaced from their books. Built with Expo (React Native) frontend + FastAPI Python backend.

## Commands

### Frontend (Expo)
```bash
npm install          # Install dependencies
npx expo start       # Start dev server (choose iOS/Android/web from menu)
expo run:ios         # Build and run on iOS simulator
npm run lint         # Run ESLint via expo lint
```

### Backend (FastAPI)
```bash
cd backend
source venv/bin/activate
pip install fastapi uvicorn docling google-generativeai python-dotenv
uvicorn main:app --reload --port 8000
```
The backend reads `GEMINI_API_KEY` from `.env` in the project root (one level up from `backend/`).

### Backend Tests
```bash
python backend/test_hooks.py
python backend/test_docling.py
python backend/test_pymupdf.py
```

## Architecture

### Frontend (`app/`)
Uses **Expo Router** with file-based routing:
- `app/(tabs)/library.tsx` — PDF upload, book list, delete. Uploads PDF to backend `/extract`, stores result in `LibraryContext`.
- `app/(tabs)/feed.tsx` — Vertical swipe feed (FlatList with `pagingEnabled`). Each card has horizontal swipe for hook → paragraph. Tapping "Read More" pushes to `/reader` with `page` param.
- `app/reader.tsx` — Dual-mode reader: native PDF (`react-native-pdf`) or markdown view. Toggle between modes preserves current page via `pendingReaderAnchorRef`.
- `app/_layout.tsx` — Root layout wrapping everything in `LibraryProvider` and `ThemeProvider`.

### State (`lib/LibraryContext.tsx`)
`LibraryContext` holds the book list in **React state only** — books are lost on app restart. Each `Book` has `id`, `title`, `uri`, `text` (markdown), and `page_anchors`.

### Backend (`backend/main.py`)
FastAPI server with three endpoints:
- `POST /extract` — Accepts PDF via multipart form. Uses **Docling** to convert PDF → markdown. Injects `[%%%PAGE_N%%%]` markers at page boundaries in the markdown. Dispatches background task to generate hooks.
- `GET /feed` — Returns all hooks from SQLite `feed.db`.
- `DELETE /book/{book_id}` — Removes all hooks for a book from the DB.

Hook generation pipeline (`generate_hooks_bg`):
1. **Step A**: If `DISABLE_AI_FOR_FEED = False`, calls Gemini API (`gemini-3-flash`) with up to 80k chars of markdown.
2. **Step B**: Falls back to `internalHeuristicGenerator` — randomly samples 5 paragraphs from the middle 80% of the book, picks a random sentence from each.
3. **Step C**: Persists results to SQLite `feed_hooks` table.

`DISABLE_AI_FOR_FEED = True` is a manual circuit breaker at the top of `main.py` — flip to `False` to enable Gemini.

### Page Sync Between PDF and Reader Modes
The backend injects `[%%%PAGE_N%%%]` strings into the markdown at page boundaries. The reader's `Markdown` component detects these via a custom `paragraph` rule, records their `y` layout positions in `yOffsets.current`, and uses `pendingReaderAnchorRef` to scroll to the right page when switching modes or when navigating from the feed.

### Feed Navigation
`feed.tsx` passes `page: item.paragraph_id` as a route param to `/reader`. `paragraph_id` is the page number (as a string) set by the backend during hook generation. `reader.tsx` reads this `page` param and opens directly to that page in PDF mode.
