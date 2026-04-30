#!/usr/bin/env python3
"""Newsletter Minigames — management CLI.

Commands:
    activate <slug>     Activate an edition (e.g. 2026-05), deactivates all others
    status              Show all editions and current active game
    add-edition         Add a new edition interactively
    reset-user <email>  Reset a user's attempts for the active edition
    export-leaderboard  Export leaderboard as CSV

Usage:
    python manage.py activate 2026-05
    python manage.py status
    python manage.py export-leaderboard
"""
import csv
import json
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "games.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def cmd_status():
    """Show all editions, active game, and player count."""
    conn = get_db()

    editions = conn.execute(
        "SELECT e.*, g.title AS game_title "
        "FROM editions e LEFT JOIN games g ON g.id = e.game_id "
        "ORDER BY e.slug"
    ).fetchall()

    users_count = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()["cnt"]
    active = conn.execute("SELECT * FROM editions WHERE active = 1 LIMIT 1").fetchone()

    print(f"\n  Registered players: {users_count}")
    if active:
        print(f"  Active edition:     {active['slug']} — {active['title']}")
    print()
    print(f"  {'Slug':<10} {'Title':<30} {'Game':<25} {'Closes':<12} {'Active'}")
    print(f"  {'-'*10} {'-'*30} {'-'*25} {'-'*12} {'-'*6}")

    for e in editions:
        marker = "  >>>" if e["active"] else ""
        print(
            f"  {e['slug']:<10} {e['title']:<30} "
            f"{(e['game_title'] or '-'):<25} {(e['closes_at'] or '-'):<12} "
            f"{'YES' if e['active'] else '-'}{marker}"
        )

    conn.close()
    print()


def cmd_activate(slug):
    """Activate an edition by slug, deactivate all others."""
    conn = get_db()

    row = conn.execute("SELECT * FROM editions WHERE slug = ?", (slug,)).fetchone()
    if not row:
        print(f"  ERROR: Edition '{slug}' not found.")
        print(f"  Available: ", end="")
        slugs = conn.execute("SELECT slug FROM editions ORDER BY slug").fetchall()
        print(", ".join(s["slug"] for s in slugs))
        conn.close()
        return

    conn.execute("UPDATE editions SET active = 0")
    conn.execute("UPDATE editions SET active = 1 WHERE slug = ?", (slug,))
    conn.commit()

    updated = conn.execute(
        "SELECT e.*, g.title AS game_title FROM editions e "
        "LEFT JOIN games g ON g.id = e.game_id WHERE e.slug = ?", (slug,)
    ).fetchone()
    conn.close()

    print(f"\n  Activated: {updated['title']}")
    print(f"  Featured game: {updated['game_title'] or 'None'}")
    print(f"  Closes: {updated['closes_at'] or 'No close date'}")
    print()


def cmd_add_edition():
    """Interactively add a new edition."""
    conn = get_db()

    # Show available games
    games = conn.execute("SELECT id, title FROM games ORDER BY sort_order").fetchall()
    print("\n  Available games:")
    for g in games:
        print(f"    {g['id']:<25} {g['title']}")

    print()
    slug = input("  Edition slug (e.g. 2027-04): ").strip()
    title = input("  Edition title (e.g. April 2027 Newsletter): ").strip()
    game_id = input("  Game ID (from list above): ").strip()
    closes = input("  Closes date (YYYY-MM-DD, or blank): ").strip() or None

    if not slug or not title:
        print("  ERROR: slug and title are required.")
        conn.close()
        return

    # Validate game exists
    if game_id:
        game = conn.execute("SELECT id FROM games WHERE id = ?", (game_id,)).fetchone()
        if not game:
            print(f"  ERROR: Game '{game_id}' not found.")
            conn.close()
            return

    try:
        conn.execute(
            "INSERT INTO editions (slug, title, game_id, active, closes_at) VALUES (?, ?, ?, 0, ?)",
            (slug, title, game_id or None, closes),
        )
        conn.commit()
        print(f"\n  Added edition: {title} (inactive — run 'activate {slug}' to go live)")
    except sqlite3.IntegrityError:
        print(f"  ERROR: Edition '{slug}' already exists.")

    conn.close()
    print()


def cmd_reset_user(email):
    """Reset a user's attempts for the active edition."""
    conn = get_db()

    user = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
    if not user:
        print(f"  ERROR: User '{email}' not found.")
        conn.close()
        return

    edition = conn.execute("SELECT * FROM editions WHERE active = 1 LIMIT 1").fetchone()
    if not edition:
        print("  ERROR: No active edition.")
        conn.close()
        return

    count = conn.execute(
        "SELECT COUNT(*) AS cnt FROM attempts WHERE user_id = ? AND edition_id = ?",
        (user["id"], edition["id"]),
    ).fetchone()["cnt"]

    conn.execute(
        "DELETE FROM attempts WHERE user_id = ? AND edition_id = ?",
        (user["id"], edition["id"]),
    )
    conn.execute(
        "DELETE FROM leaderboard_cache WHERE user_id = ? AND edition_id = ?",
        (user["id"], edition["id"]),
    )
    conn.commit()
    conn.close()

    print(f"\n  Reset {count} attempts for {user['display_name']} ({email})")
    print(f"  Edition: {edition['title']}")
    print()


def cmd_export_leaderboard():
    """Export the all-time leaderboard as CSV to stdout."""
    conn = get_db()
    rows = conn.execute(
        "SELECT u.email, u.display_name, SUM(lc.total_score) AS total, "
        "SUM(lc.games_played) AS games "
        "FROM leaderboard_cache lc JOIN users u ON u.id = lc.user_id "
        "GROUP BY lc.user_id ORDER BY total DESC"
    ).fetchall()
    conn.close()

    writer = csv.writer(sys.stdout)
    writer.writerow(["Rank", "Email", "Display Name", "Total Score", "Games Played"])
    for i, row in enumerate(rows, 1):
        writer.writerow([i, row["email"], row["display_name"], row["total"], row["games"]])

    if not rows:
        print("  No leaderboard data yet.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

COMMANDS = {
    "status": (cmd_status, 0),
    "activate": (cmd_activate, 1),
    "add-edition": (cmd_add_edition, 0),
    "reset-user": (cmd_reset_user, 1),
    "export-leaderboard": (cmd_export_leaderboard, 0),
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print("\n  KPMG Newsletter Minigames — Management CLI")
        print()
        print("  Commands:")
        print("    status                Show all editions and active game")
        print("    activate <slug>       Activate a monthly edition (e.g. 2026-05)")
        print("    add-edition           Add a new edition interactively")
        print("    reset-user <email>    Reset a user's attempts for active edition")
        print("    export-leaderboard    Export all-time leaderboard as CSV")
        print()
        print(f"  Usage: python {sys.argv[0]} <command> [args]")
        print()
        sys.exit(1)

    cmd_name = sys.argv[1]
    func, nargs = COMMANDS[cmd_name]

    if nargs > 0 and len(sys.argv) < 2 + nargs:
        print(f"  ERROR: '{cmd_name}' requires {nargs} argument(s).")
        sys.exit(1)

    args = sys.argv[2:2 + nargs]
    func(*args)
