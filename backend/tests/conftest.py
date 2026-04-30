import os
import sys
import tempfile

# Point the app at a throw-away DB for every test session.
# Must be set BEFORE main.py is first imported (module-level DB_PATH reads it).
_tmp_db = tempfile.mktemp(suffix="_test_feed.db")
os.environ["FEED_DB_PATH"] = _tmp_db

# Make sure `import hooks` and `import main` resolve from the backend directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
