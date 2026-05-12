#!/usr/bin/env python3
"""Flask WSGI wrapper for PythonAnywhere (and any WSGI host).

Thin layer that routes requests to the existing server.py logic.
Flask is pre-installed on PythonAnywhere — no pip install needed.
"""
import json
import os
import re

from flask import Flask, request, jsonify, send_from_directory, g

# Import all the business logic from server.py
import server

# ---------------------------------------------------------------------------
# Initialise
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "games.db")

# Point server module at our database
server._DB_PATH = DB_PATH

app = Flask(__name__, static_folder=None)  # We handle static files ourselves


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json(data, status=200):
    """Return a JSON response."""
    body = json.dumps(data, default=str)
    resp = app.response_class(body, status=status, mimetype="application/json")
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


def _get_user():
    """Extract authenticated user from Authorization header."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None

    from datetime import datetime
    conn = server._get_db()
    row = conn.execute(
        "SELECT s.user_id, s.expires_at, u.id, u.email, u.display_name "
        "FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token = ?",
        (token,),
    ).fetchone()
    conn.close()

    if not row:
        return None
    if row["expires_at"]:
        from datetime import datetime
        expires = datetime.fromisoformat(row["expires_at"])
        if datetime.now(tz=None) > expires:
            return None

    return {"id": row["id"], "email": row["email"], "display_name": row["display_name"]}


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def register():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    display_name = (body.get("display_name") or "").strip()

    if not email or not display_name:
        return _json({"error": "email and display_name are required"}, 400)

    if not email.endswith(server.ALLOWED_EMAIL_DOMAIN):
        return _json({"error": f"Only {server.ALLOWED_EMAIL_DOMAIN} email addresses are allowed"}, 403)

    conn = server._get_db()
    existing = conn.execute("SELECT id, email, display_name FROM users WHERE email = ?", (email,)).fetchone()

    if existing:
        user = dict(existing)
    else:
        cur = conn.execute("INSERT INTO users (email, display_name) VALUES (?, ?)", (email, display_name))
        conn.commit()
        user = {"id": cur.lastrowid, "email": email, "display_name": display_name}

    conn.close()
    token = server._create_session(user["id"])
    return _json({"token": token, "user": user}, 201)


@app.route("/api/auth/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()

    if not email:
        return _json({"error": "email is required"}, 400)

    if not email.endswith(server.ALLOWED_EMAIL_DOMAIN):
        return _json({"error": f"Only {server.ALLOWED_EMAIL_DOMAIN} email addresses are allowed"}, 403)

    conn = server._get_db()
    row = conn.execute("SELECT id, email, display_name FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    if not row:
        return _json({"error": "User not found"}, 404)

    user = dict(row)
    token = server._create_session(user["id"])
    return _json({"token": token, "user": user})


@app.route("/api/auth/me", methods=["GET"])
def me():
    user = _get_user()
    if not user:
        return _json({"error": "Unauthorized"}, 401)
    return _json(user)


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    user = _get_user()
    if not user:
        return _json({"error": "Unauthorized"}, 401)

    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip()
    conn = server._get_db()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()
    return _json({"ok": True})


# ---------------------------------------------------------------------------
# Editions routes
# ---------------------------------------------------------------------------

@app.route("/api/editions", methods=["GET"])
def editions():
    conn = server._get_db()
    rows = conn.execute("SELECT * FROM editions ORDER BY active DESC, created_at DESC").fetchall()
    conn.close()
    return _json(server._rows_to_list(rows))


@app.route("/api/editions/current", methods=["GET"])
def editions_current():
    conn = server._get_db()
    row = conn.execute("SELECT * FROM editions WHERE active = 1 ORDER BY created_at DESC LIMIT 1").fetchone()
    conn.close()
    if not row:
        return _json({"error": "No active edition"}, 404)
    return _json(dict(row))


# ---------------------------------------------------------------------------
# Games routes
# ---------------------------------------------------------------------------

@app.route("/api/games", methods=["GET"])
def games():
    conn = server._get_db()
    show_all = request.args.get("all")

    if show_all:
        rows = conn.execute("SELECT * FROM games ORDER BY sort_order").fetchall()
    else:
        edition = conn.execute(
            "SELECT game_id FROM editions WHERE active = 1 ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
        if edition and edition["game_id"]:
            rows = conn.execute("SELECT * FROM games WHERE id = ?", (edition["game_id"],)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM games ORDER BY sort_order").fetchall()

    conn.close()
    return _json(server._rows_to_list(rows))


@app.route("/api/games/<game_id>", methods=["GET"])
def game_detail(game_id):
    conn = server._get_db()
    row = conn.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    if not row:
        conn.close()
        return _json({"error": "Game not found"}, 404)

    result = dict(row)
    user = _get_user()
    if user:
        edition = conn.execute("SELECT id FROM editions WHERE active = 1 ORDER BY created_at DESC LIMIT 1").fetchone()
        if edition:
            attempts = conn.execute(
                "SELECT id, score, duration_ms, attempt_num, played_at FROM attempts "
                "WHERE user_id = ? AND game_id = ? AND edition_id = ? ORDER BY attempt_num",
                (user["id"], game_id, edition["id"]),
            ).fetchall()
            result["my_attempts"] = server._rows_to_list(attempts)
            result["attempts_remaining"] = max(0, server.MAX_ATTEMPTS - len(result["my_attempts"]))
        else:
            result["my_attempts"] = []
            result["attempts_remaining"] = server.MAX_ATTEMPTS

    conn.close()
    return _json(result)


# ---------------------------------------------------------------------------
# Attempts routes
# ---------------------------------------------------------------------------

@app.route("/api/attempts", methods=["GET"])
def get_attempts():
    user = _get_user()
    if not user:
        return _json({"error": "Unauthorized"}, 401)

    game_id = request.args.get("game_id")
    edition_id = request.args.get("edition_id")

    if not game_id or not edition_id:
        return _json({"error": "game_id and edition_id are required"}, 400)

    try:
        edition_id = int(edition_id)
    except (ValueError, TypeError):
        return _json({"error": "edition_id must be an integer"}, 400)

    conn = server._get_db()
    rows = conn.execute(
        "SELECT id, score, duration_ms, attempt_num, played_at FROM attempts "
        "WHERE user_id = ? AND game_id = ? AND edition_id = ? ORDER BY attempt_num",
        (user["id"], game_id, edition_id),
    ).fetchall()
    conn.close()

    attempts = server._rows_to_list(rows)
    used = len(attempts)
    best_score = max((a["score"] for a in attempts), default=0)

    return _json({
        "used": used,
        "remaining": max(0, server.MAX_ATTEMPTS - used),
        "best_score": best_score,
        "attempts": attempts,
    })


@app.route("/api/attempts", methods=["POST"])
def submit_attempt():
    user = _get_user()
    if not user:
        return _json({"error": "Unauthorized"}, 401)

    body = request.get_json(silent=True) or {}
    game_id = body.get("game_id")
    edition_id = body.get("edition_id")
    score = body.get("score")
    duration_ms = body.get("duration_ms")

    if not game_id or edition_id is None or score is None:
        return _json({"error": "game_id, edition_id, and score are required"}, 400)

    try:
        score = int(score)
        edition_id = int(edition_id)
    except (ValueError, TypeError):
        return _json({"error": "score and edition_id must be integers"}, 400)

    if score < 0:
        return _json({"error": "Score cannot be negative"}, 400)

    conn = server._get_db()

    game = conn.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
    if not game:
        conn.close()
        return _json({"error": "Game not found"}, 404)

    if game["max_score"] is not None and score > game["max_score"]:
        conn.close()
        return _json({"error": f"Score exceeds maximum ({game['max_score']})"}, 400)

    edition = conn.execute("SELECT * FROM editions WHERE id = ?", (edition_id,)).fetchone()
    if not edition:
        conn.close()
        return _json({"error": "Edition not found"}, 404)

    if edition["game_id"] and edition["game_id"] != game_id:
        conn.close()
        return _json({"error": f"This edition only allows the game: {edition['game_id']}"}, 403)

    count_row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM attempts WHERE user_id = ? AND game_id = ? AND edition_id = ?",
        (user["id"], game_id, edition_id),
    ).fetchone()
    current_count = count_row["cnt"]

    if current_count >= server.MAX_ATTEMPTS:
        conn.close()
        return _json({"error": f"Maximum attempts ({server.MAX_ATTEMPTS}) reached", "attempt_num": current_count, "remaining": 0}, 403)

    attempt_num = current_count + 1
    import sqlite3
    try:
        conn.execute(
            "INSERT INTO attempts (user_id, game_id, edition_id, score, duration_ms, attempt_num) VALUES (?, ?, ?, ?, ?, ?)",
            (user["id"], game_id, edition_id, score, duration_ms, attempt_num),
        )
    except sqlite3.IntegrityError:
        conn.close()
        return _json({"error": "Attempt already recorded"}, 409)

    server._update_leaderboard_cache(conn, user["id"], edition_id)
    conn.commit()

    best_row = conn.execute(
        "SELECT MAX(score) AS best FROM attempts WHERE user_id = ? AND game_id = ? AND edition_id = ?",
        (user["id"], game_id, edition_id),
    ).fetchone()

    rank_row = conn.execute(
        "SELECT COUNT(*) + 1 AS rank FROM leaderboard_cache "
        "WHERE edition_id = ? AND total_score > ("
        "  SELECT total_score FROM leaderboard_cache WHERE user_id = ? AND edition_id = ?)",
        (edition_id, user["id"], edition_id),
    ).fetchone()

    conn.close()
    return _json({
        "attempt_num": attempt_num,
        "remaining": server.MAX_ATTEMPTS - attempt_num,
        "best_score": best_row["best"] if best_row else score,
        "leaderboard_rank": rank_row["rank"] if rank_row else 1,
    }, 201)


# ---------------------------------------------------------------------------
# Leaderboard routes
# ---------------------------------------------------------------------------

@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    edition_id = request.args.get("edition_id")
    conn = server._get_db()

    if not edition_id:
        row = conn.execute("SELECT id FROM editions WHERE active = 1 ORDER BY created_at DESC LIMIT 1").fetchone()
        if row:
            edition_id = row["id"]
        else:
            conn.close()
            return _json([])

    try:
        edition_id = int(edition_id)
    except (ValueError, TypeError):
        conn.close()
        return _json({"error": "edition_id must be an integer"}, 400)

    rows = conn.execute(
        "SELECT lc.user_id, u.display_name, lc.total_score, lc.games_played, lc.best_scores_json "
        "FROM leaderboard_cache lc JOIN users u ON u.id = lc.user_id "
        "WHERE lc.edition_id = ? ORDER BY lc.total_score DESC LIMIT 50",
        (edition_id,),
    ).fetchall()
    conn.close()

    results = []
    for i, row in enumerate(rows, 1):
        d = dict(row)
        d["rank"] = i
        try:
            d["best_scores"] = json.loads(d.get("best_scores_json") or "{}")
        except (json.JSONDecodeError, TypeError):
            d["best_scores"] = {}
        d.pop("best_scores_json", None)
        results.append(d)

    return _json(results)


@app.route("/api/leaderboard/all-time", methods=["GET"])
def leaderboard_alltime():
    conn = server._get_db()
    rows = conn.execute(
        "SELECT lc.user_id, u.display_name, SUM(lc.total_score) AS total_score, "
        "SUM(lc.games_played) AS games_played "
        "FROM leaderboard_cache lc JOIN users u ON u.id = lc.user_id "
        "GROUP BY lc.user_id ORDER BY total_score DESC LIMIT 50"
    ).fetchall()
    conn.close()

    results = []
    for i, row in enumerate(rows, 1):
        d = dict(row)
        d["rank"] = i
        results.append(d)
    return _json(results)


@app.route("/api/leaderboard/me", methods=["GET"])
def leaderboard_me():
    user = _get_user()
    if not user:
        return _json({"error": "Unauthorized"}, 401)

    edition_id = request.args.get("edition_id")
    conn = server._get_db()

    if not edition_id:
        row = conn.execute("SELECT id FROM editions WHERE active = 1 ORDER BY created_at DESC LIMIT 1").fetchone()
        if row:
            edition_id = row["id"]
        else:
            conn.close()
            return _json({"error": "No active edition"}, 404)

    try:
        edition_id = int(edition_id)
    except (ValueError, TypeError):
        conn.close()
        return _json({"error": "edition_id must be an integer"}, 400)

    cache = conn.execute(
        "SELECT total_score, games_played, best_scores_json FROM leaderboard_cache WHERE user_id = ? AND edition_id = ?",
        (user["id"], edition_id),
    ).fetchone()

    if not cache:
        conn.close()
        return _json({"user": user, "edition_id": edition_id, "total_score": 0, "games_played": 0, "best_scores": {}, "rank": None, "total_players": 0})

    rank_row = conn.execute(
        "SELECT COUNT(*) + 1 AS rank FROM leaderboard_cache WHERE edition_id = ? AND total_score > ?",
        (edition_id, cache["total_score"]),
    ).fetchone()
    total_players = conn.execute("SELECT COUNT(*) AS cnt FROM leaderboard_cache WHERE edition_id = ?", (edition_id,)).fetchone()["cnt"]
    conn.close()

    try:
        best_scores = json.loads(cache["best_scores_json"] or "{}")
    except (json.JSONDecodeError, TypeError):
        best_scores = {}

    return _json({
        "user": user, "edition_id": edition_id,
        "total_score": cache["total_score"], "games_played": cache["games_played"],
        "best_scores": best_scores, "rank": rank_row["rank"], "total_players": total_players,
    })


# ---------------------------------------------------------------------------
# Static file serving
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(os.path.join(BASE_DIR, "assets"), filename)


@app.route("/games/<path:filename>")
def game_files(filename):
    """Serve game files. Handles both /games/slug/ and /games/slug/file.ext."""
    games_dir = os.path.join(BASE_DIR, "games")
    full_path = os.path.join(games_dir, filename)

    # Security: ensure resolved path is within games_dir
    resolved = os.path.realpath(full_path)
    if not resolved.startswith(os.path.realpath(games_dir)):
        return "Forbidden", 403

    # Directory → serve index.html
    if os.path.isdir(resolved):
        return send_from_directory(resolved, "index.html")

    # File → serve directly
    directory = os.path.dirname(resolved)
    basename = os.path.basename(resolved)
    return send_from_directory(directory, basename)


# ---------------------------------------------------------------------------
# Local development
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not os.path.isfile(DB_PATH):
        print("[MINIGAMES] Run init_db.py first to create the database.")
    else:
        print(f"[MINIGAMES] Flask dev server at http://127.0.0.1:8080")
        app.run(host="127.0.0.1", port=8080, debug=True)
