#!/usr/bin/env bash
# Run the full test suite — backend Python tests + frontend Jest tests.
# Exit code is non-zero if anything fails.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AntiBook Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Backend ──────────────────────────────────────────────────────────────────
echo ""
echo "▶ Backend (pytest)"
echo "──────────────────────────────────────────────────"

BACKEND_DIR="$ROOT/backend"
VENV_PYTHON="$BACKEND_DIR/venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "ERROR: backend venv not found at $BACKEND_DIR/venv"
  echo "  Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

cd "$BACKEND_DIR"
"$VENV_PYTHON" -m pytest tests/ -v --tb=short
BACKEND_EXIT=$?

# ── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "▶ Frontend (Jest)"
echo "──────────────────────────────────────────────────"

cd "$ROOT"
npx jest --passWithNoTests --forceExit
FRONTEND_EXIT=$?

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $BACKEND_EXIT -eq 0 ] && [ $FRONTEND_EXIT -eq 0 ]; then
  echo "  ✓ All tests passed"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  [ $BACKEND_EXIT -ne 0 ] && echo "  ✗ Backend tests FAILED"
  [ $FRONTEND_EXIT -ne 0 ] && echo "  ✗ Frontend tests FAILED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
