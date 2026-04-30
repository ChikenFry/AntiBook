"""
Integration tests for the FastAPI endpoints.
Uses a throw-away SQLite DB (set in conftest.py via FEED_DB_PATH).
"""
import sqlite3
import os
import pytest
from fastapi.testclient import TestClient

# conftest.py sets FEED_DB_PATH and sys.path before this import
from main import app, DB_PATH

client = TestClient(app)


def seed_hooks(book_id: str, hooks: list[dict]):
    """Insert test hooks directly into the test DB."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    for h in hooks:
        c.execute(
            "INSERT INTO feed_hooks (book_id, hook, paragraph, paragraph_id) VALUES (?, ?, ?, ?)",
            (book_id, h["hook"], h["paragraph"], h["paragraph_id"])
        )
    conn.commit()
    conn.close()


def clear_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM feed_hooks")
    conn.commit()
    conn.close()


@pytest.fixture(autouse=True)
def clean_between_tests():
    clear_db()
    yield
    clear_db()


# ─────────────────────────────────────────────────────────────────────────────
# GET /feed
# ─────────────────────────────────────────────────────────────────────────────

class TestGetFeed:
    def test_empty_feed_returns_empty_list(self):
        response = client.get("/feed")
        assert response.status_code == 200
        assert response.json() == []

    def test_feed_returns_seeded_hooks(self):
        seed_hooks("book1", [
            {"hook": "Truth is stranger than fiction.", "paragraph": "Full paragraph text here.", "paragraph_id": "12"},
        ])
        response = client.get("/feed")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["hook"] == "Truth is stranger than fiction."
        assert data[0]["book_id"] == "book1"
        assert data[0]["paragraph_id"] == "12"

    def test_feed_returns_all_books(self):
        seed_hooks("book1", [{"hook": "Hook A.", "paragraph": "Para A.", "paragraph_id": "1"}])
        seed_hooks("book2", [{"hook": "Hook B.", "paragraph": "Para B.", "paragraph_id": "5"}])
        response = client.get("/feed")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        book_ids = {item["book_id"] for item in data}
        assert book_ids == {"book1", "book2"}

    def test_feed_items_have_required_fields(self):
        seed_hooks("book1", [{"hook": "Hook.", "paragraph": "Para.", "paragraph_id": "3"}])
        data = client.get("/feed").json()
        item = data[0]
        assert "id" in item
        assert "book_id" in item
        assert "hook" in item
        assert "paragraph" in item
        assert "paragraph_id" in item


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /book/{book_id}
# ─────────────────────────────────────────────────────────────────────────────

class TestDeleteBook:
    def test_delete_removes_hooks_for_book(self):
        seed_hooks("book1", [
            {"hook": "Hook 1.", "paragraph": "Para 1.", "paragraph_id": "1"},
            {"hook": "Hook 2.", "paragraph": "Para 2.", "paragraph_id": "2"},
        ])
        seed_hooks("book2", [
            {"hook": "Keep this.", "paragraph": "Para.", "paragraph_id": "5"},
        ])

        response = client.delete("/book/book1")
        assert response.status_code == 200
        assert response.json()["status"] == "success"

        feed = client.get("/feed").json()
        book_ids = [item["book_id"] for item in feed]
        assert "book1" not in book_ids
        assert "book2" in book_ids

    def test_delete_non_existent_book_succeeds(self):
        # Deleting a book with no hooks should not error
        response = client.delete("/book/ghost_book")
        assert response.status_code == 200
        assert response.json()["status"] == "success"

    def test_delete_leaves_empty_feed_when_only_book(self):
        seed_hooks("book1", [{"hook": "H.", "paragraph": "P.", "paragraph_id": "1"}])
        client.delete("/book/book1")
        assert client.get("/feed").json() == []
