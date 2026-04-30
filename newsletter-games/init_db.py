#!/usr/bin/env python3
"""Newsletter Minigames — database initialisation.

Creates the SQLite database with schema and seed data.
Usage: python init_db.py [path]   (defaults to games.db in same directory)
"""
import os
import sqlite3
import sys

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
);

CREATE TABLE IF NOT EXISTS editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    game_id TEXT REFERENCES games(id),
    active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    closes_at TEXT
);

CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    max_score INTEGER,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    game_id TEXT NOT NULL REFERENCES games(id),
    edition_id INTEGER NOT NULL REFERENCES editions(id),
    score INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    attempt_num INTEGER NOT NULL,
    played_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, game_id, edition_id, attempt_num)
);

CREATE TABLE IF NOT EXISTS leaderboard_cache (
    user_id INTEGER NOT NULL REFERENCES users(id),
    edition_id INTEGER NOT NULL REFERENCES editions(id),
    total_score INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    best_scores_json TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, edition_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_edition
    ON attempts(user_id, edition_id);
CREATE INDEX IF NOT EXISTS idx_attempts_game_edition
    ON attempts(game_id, edition_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_edition_score
    ON leaderboard_cache(edition_id, total_score DESC);
"""

SEED_GAMES = [
    (
        "consultant-rush", "Consultant Rush",
        "Dodge meeting invites and printer jams in the office corridor. "
        "Collect golden client logos for bonus points.",
        10000, 1,
    ),
    (
        "audit-ascent", "Audit Ascent",
        "Fly through financial statements avoiding red-flag line items. "
        "Collect checkmarks to boost your audit score.",
        10000, 2,
    ),
    (
        "flappy-brief", "Flappy Brief",
        "Navigate your briefcase through gaps in compliance regulation walls. "
        "How far can you fly?",
        999, 3,
    ),
    (
        "deal-spell", "Deal Spell",
        "Guess consulting and M&A terms letter by letter. "
        "Wrong guesses drain your deal value.",
        5000, 4,
    ),
    (
        "tax-tetris", "Tax Tetris",
        "Stack falling tax deduction blocks to complete rows and lodge returns. "
        "Speed increases each level.",
        50000, 5,
    ),
    (
        "slide-deck-stacker", "Slide Deck Stacker",
        "Stack slide decks by tapping at the right moment. "
        "Misaligned portions get trimmed.",
        100, 6,
    ),
    (
        "budget-blitz", "Budget Blitz",
        "Squash budget overruns popping up on your spreadsheet "
        "before they drain the project budget.",
        5000, 7,
    ),
    (
        "merger-match", "Merger Match",
        "Flip cards to match successful company mergers. "
        "Fewer flips and faster times mean higher scores.",
        5000, 8,
    ),
    (
        "risk-radar", "Risk Radar",
        "Rotate your shield to deflect incoming risks on the radar screen. "
        "Different risk types score differently.",
        10000, 9,
    ),
    (
        "pipeline-plumber", "Pipeline Plumber",
        "Rotate pipe segments to connect the deal pipeline from Lead to Won "
        "before time runs out.",
        10000, 10,
    ),
    (
        "kpi-catcher", "KPI Catcher",
        "Catch the green KPI cards and dodge the red ones. "
        "Build streak multipliers for massive scores.",
        10000, 11,
    ),
    (
        "strategy-snake", "Strategy Snake",
        "Eat strategic initiatives to grow your consulting team. "
        "Avoid scope creep walls that randomly appear.",
        10000, 12,
    ),
]

# One edition per month, each featuring a different game.
# (slug, title, game_id, active, closes_at)
# Only the current month (April 2026) is active.
SEED_EDITIONS = [
    ("2026-04", "April 2026 Newsletter",     "consultant-rush",      1, "2026-04-30"),
    ("2026-05", "May 2026 Newsletter",        "audit-ascent",         0, "2026-05-31"),
    ("2026-06", "June 2026 Newsletter",       "flappy-brief",         0, "2026-06-30"),
    ("2026-07", "July 2026 Newsletter",       "deal-spell",           0, "2026-07-31"),
    ("2026-08", "August 2026 Newsletter",     "tax-tetris",           0, "2026-08-31"),
    ("2026-09", "September 2026 Newsletter",  "slide-deck-stacker",   0, "2026-09-30"),
    ("2026-10", "October 2026 Newsletter",    "budget-blitz",         0, "2026-10-31"),
    ("2026-11", "November 2026 Newsletter",   "merger-match",         0, "2026-11-30"),
    ("2026-12", "December 2026 Newsletter",   "risk-radar",           0, "2026-12-31"),
    ("2027-01", "January 2027 Newsletter",    "pipeline-plumber",     0, "2027-01-31"),
    ("2027-02", "February 2027 Newsletter",   "kpi-catcher",          0, "2027-02-28"),
    ("2027-03", "March 2027 Newsletter",      "strategy-snake",       0, "2027-03-31"),
]


def init_db(db_path: str) -> None:
    """Create schema, seed games and editions, enable WAL."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)

    # Seed games (safe to re-run)
    for game in SEED_GAMES:
        conn.execute(
            "INSERT OR IGNORE INTO games (id, title, description, max_score, sort_order) "
            "VALUES (?, ?, ?, ?, ?)",
            game,
        )

    # Seed monthly editions (one game per edition)
    for edition in SEED_EDITIONS:
        conn.execute(
            "INSERT OR IGNORE INTO editions (slug, title, game_id, active, closes_at) "
            "VALUES (?, ?, ?, ?, ?)",
            edition,
        )

    conn.commit()
    conn.close()
    print(f"[MINIGAMES] Database initialised: {db_path}")
    print(f"[MINIGAMES] Seeded {len(SEED_GAMES)} games + {len(SEED_EDITIONS)} monthly editions")


if __name__ == "__main__":
    default_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "games.db"
    )
    path = sys.argv[1] if len(sys.argv) > 1 else default_path
    init_db(path)
