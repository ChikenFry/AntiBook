#!/usr/bin/env bash
# Install the pre-commit hook into .git/hooks/.
# Run once after cloning: bash scripts/setup-hooks.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" << 'EOF'
#!/usr/bin/env bash
# Pre-commit: run the full test suite before every commit.
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
bash "$ROOT/scripts/run_tests.sh"
EOF

chmod +x "$HOOK"
echo "✓ Pre-commit hook installed at $HOOK"
echo "  Tests will run automatically on every 'git commit'."
