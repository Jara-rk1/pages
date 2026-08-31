"""Regression tests for D2-7: OverflowError on non-finite / out-of-range
score and edition_id values (MULTIPLEX remediation, plan item 4).

Two distinct routes to the same crash:

1. `{"score": 1e400}` is valid JSON. `json.loads` parses it permissively to
   `float('inf')`. `int(float('inf'))` raises `OverflowError`, which is not
   in the `except (ValueError, TypeError)` tuple guarding the cast in
   `server.py`/`wsgi.py`. The stdlib server drops the connection; the Flask
   wrapper returns a 500. Every other malformed score already gets a clean
   400 -- only the non-finite-float case was missing.

2. A huge but FINITE value (`1e308`, or a 30+ digit integer literal) casts
   to `int()` cleanly -- no exception there at all -- and is only rejected
   later, if at all. `edition_id` had no such check anywhere: it reaches an
   unguarded `sqlite3` parameter bind, which raises `OverflowError` of its
   own (SQLite binds a Python int as a signed 64-bit C long long) with
   nothing nearby to catch it. `score` is normally caught by the game's
   `max_score` check, but that check is skipped entirely when a game row
   has `max_score IS NULL`, so the same unguarded bind is reachable there
   too.

`int(float('nan'))` raises `ValueError`, already caught, so NaN is not a
defect and is not exercised here.
"""
import http.client
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

import init_db  # noqa: E402
import server  # noqa: E402

try:
    import flask  # noqa: F401
    _HAS_FLASK = True
except ImportError:
    _HAS_FLASK = False


def _seed_db(db_path, null_max_score_game=False):
    """Fresh schema + seed games/editions, plus one user + session token.

    If null_max_score_game, also add a game with max_score = NULL, to
    exercise the code path where the max_score check is skipped entirely.
    """
    init_db.init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO users (email, display_name) VALUES (?, ?)",
        ("scoretest@kpmg.com.au", "Score Test"),
    )
    user_id = conn.execute(
        "SELECT id FROM users WHERE email = ?", ("scoretest@kpmg.com.au",)
    ).fetchone()[0]
    token = "test-token-score-bounds"
    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, NULL)",
        (token, user_id),
    )
    if null_max_score_game:
        conn.execute(
            "INSERT INTO games (id, title, description, max_score, sort_order) "
            "VALUES ('no-cap-game', 'No Cap Game', 'test fixture', NULL, 999)"
        )
    conn.commit()
    conn.close()
    return token


# Edition id 1 is "2026-04" (game_id "consultant-rush"), first row of
# init_db.SEED_EDITIONS, matching AUTOINCREMENT id 1 on a fresh database.
EDITION_ID = 1
GAME_ID = "consultant-rush"


class StdlibServerScoreBoundsTest(unittest.TestCase):
    """Drives the real stdlib HTTPServer (server.py) over a socket."""

    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp(prefix="score_bounds_")
        cls.db_path = os.path.join(cls.tmpdir, "games.db")
        cls.token = _seed_db(cls.db_path, null_max_score_game=True)
        server._DB_PATH = cls.db_path
        cls.httpd = server.HTTPServer(("127.0.0.1", 0), server.GamesHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join(timeout=5)
        cls.httpd.server_close()

    def _post_raw(self, path, raw_body, token=None):
        """POST a raw JSON body (may contain tokens json.dumps can't emit,
        e.g. 1e400), return (status, body bytes). Lets connection errors
        propagate -- pre-fix, that IS the observed failure mode.

        token overrides the fixture's Authorization bearer (used by the
        end-to-end round trip, which authenticates as a freshly-registered
        user rather than the shared fixture user)."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request(
                "POST",
                path,
                body=raw_body.encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token if token is not None else self.token}",
                },
            )
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def _get(self, path):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request("GET", path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def test_score_1e400_returns_400(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": 1e400}}'
        status, body = self._post_raw("/api/attempts", raw)
        self.assertEqual(status, 400, body)

    def test_score_negative_1e400_returns_400(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": -1e400}}'
        status, body = self._post_raw("/api/attempts", raw)
        self.assertEqual(status, 400, body)

    def test_edition_id_1e400_in_body_returns_400(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": 1e400, "score": 10}}'
        status, body = self._post_raw("/api/attempts", raw)
        self.assertEqual(status, 400, body)

    def test_huge_finite_score_rejected_by_max_score(self):
        """1e308 is finite; int() succeeds; max_score must still reject it.

        Pre-existing, correct behaviour -- asserted here so a later change
        to this lane does not silently break it, not because it was broken.
        """
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": 1e308}}'
        status, body = self._post_raw("/api/attempts", raw)
        self.assertEqual(status, 400, body)
        self.assertIn(b"exceeds maximum", body)

    def test_huge_finite_score_with_null_max_score_returns_400(self):
        """When max_score IS NULL the game-specific check is skipped entirely;
        the score must still be rejected before it reaches the DB bind."""
        body_json = json.dumps({
            "game_id": "no-cap-game", "edition_id": EDITION_ID, "score": 10 ** 30,
        })
        status, body = self._post_raw("/api/attempts", body_json)
        self.assertEqual(status, 400, body)

    def test_huge_digit_string_duration_ms_returns_400(self):
        """duration_ms is never cast at all (unlike score/edition_id), so a
        huge JSON integer literal reaches the INSERT bind unguarded unless
        this field gets the same range check."""
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 10,
            "duration_ms": 10 ** 30,
        })
        status, body = self._post_raw("/api/attempts", body_json)
        self.assertEqual(status, 400, body)

    def test_duration_ms_infinite_returns_400(self):
        """A non-finite duration_ms previously bound silently as REAL inf;
        now rejected the same as any other invalid value."""
        raw = (
            f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, '
            f'"score": 10, "duration_ms": 1e400}}'
        )
        status, body = self._post_raw("/api/attempts", raw)
        self.assertEqual(status, 400, body)

    def test_duration_ms_wrong_type_list_returns_400(self):
        """A list/dict duration_ms raises sqlite3.ProgrammingError at bind,
        uncaught, unless the type is checked before it gets there."""
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 10,
            "duration_ms": [1, 2, 3],
        })
        status, body = self._post_raw("/api/attempts", body_json)
        self.assertEqual(status, 400, body)

    def test_duration_ms_wrong_type_string_returns_400(self):
        """A string duration_ms previously bound silently as TEXT into an
        INTEGER column; now rejected the same as any other invalid type."""
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 10,
            "duration_ms": "not-a-number",
        })
        status, body = self._post_raw("/api/attempts", body_json)
        self.assertEqual(status, 400, body)

    def test_game_id_wrong_type_list_returns_400(self):
        """A non-empty list is truthy, so `if not game_id` alone lets it
        through; it then raises sqlite3.ProgrammingError at the games
        lookup bind, uncaught, unless game_id's type is checked too."""
        body_json = json.dumps({
            "game_id": [1, 2, 3], "edition_id": EDITION_ID, "score": 10,
        })
        status, body = self._post_raw("/api/attempts", body_json)
        self.assertEqual(status, 400, body)

    def test_huge_digit_string_edition_id_in_body_returns_400(self):
        """A 30-digit edition_id in the JSON body: int() is a no-op (already
        an int), no exception at cast time; must still be rejected before
        the unguarded editions lookup binds it."""
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": 10 ** 30, "score": 10,
        })
        status, body = self._post_raw("/api/attempts", body_json)
        self.assertEqual(status, 400, body)

    def test_huge_digit_string_edition_id_in_query_returns_400(self):
        """Same value, but via a query-string GET (api_leaderboard):
        int(str) never raises OverflowError, so this must be caught by a
        magnitude check, not by the existing ValueError/TypeError tuple."""
        status, body = self._get(f"/api/leaderboard?edition_id={10 ** 30}")
        self.assertEqual(status, 400, body)

    def test_server_survives_after_overflow_score(self):
        """Sanity net: a bad payload must never wedge the server loop.

        Note: this passes even on the unfixed code, because Python's
        socketserver already isolates a per-request crash from the accept
        loop. It is not a regression indicator for this defect by itself --
        the status-code assertions above are -- but it is worth keeping as
        a guard against a future change that blocks the loop outright.
        """
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": 1e400}}'
        try:
            self._post_raw("/api/attempts", raw)
        except (ConnectionError, http.client.HTTPException):
            pass
        status, _ = self._get("/api/games")
        self.assertEqual(status, 200)

    def test_register_email_wrong_type_returns_400(self):
        """A non-empty list for email is truthy, so it reaches
        `(email or "").strip()` and raises AttributeError, uncaught,
        unless the type is checked first."""
        body_json = json.dumps({"email": [1, 2, 3], "display_name": "Test"})
        status, body = self._post_raw("/api/auth/register", body_json)
        self.assertEqual(status, 400, body)

    def test_register_display_name_wrong_type_returns_400(self):
        body_json = json.dumps({
            "email": "typecheck@kpmg.com.au", "display_name": {"a": 1},
        })
        status, body = self._post_raw("/api/auth/register", body_json)
        self.assertEqual(status, 400, body)

    def test_login_email_wrong_type_returns_400(self):
        body_json = json.dumps({"email": [1, 2, 3]})
        status, body = self._post_raw("/api/auth/login", body_json)
        self.assertEqual(status, 400, body)

    def test_end_to_end_register_login_submit_attempt_succeeds(self):
        """Proves the register/login type guards did not break a legitimate
        caller: a real string email/display_name must still work all the way
        through register -> login -> a successful attempt submission."""
        register_body = json.dumps({
            "email": "e2e-roundtrip@kpmg.com.au", "display_name": "E2E Roundtrip",
        })
        status, body = self._post_raw("/api/auth/register", register_body)
        self.assertEqual(status, 201, body)

        login_body = json.dumps({"email": "e2e-roundtrip@kpmg.com.au"})
        status, body = self._post_raw("/api/auth/login", login_body)
        self.assertEqual(status, 200, body)
        login_token = json.loads(body)["token"]

        attempt_body = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 500,
        })
        status, body = self._post_raw("/api/attempts", attempt_body, token=login_token)
        self.assertEqual(status, 201, body)


@unittest.skipUnless(_HAS_FLASK, "flask not installed in this environment")
class WsgiScoreBoundsTest(unittest.TestCase):
    """Drives the Flask wrapper (wsgi.py) in-process via its test client."""

    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp(prefix="score_bounds_wsgi_")
        cls.db_path = os.path.join(cls.tmpdir, "games.db")
        cls.token = _seed_db(cls.db_path, null_max_score_game=True)
        import wsgi
        wsgi.server._DB_PATH = cls.db_path
        cls.client = wsgi.app.test_client()

    def _post_raw(self, path, raw_body, token=None):
        return self.client.post(
            path,
            data=raw_body.encode("utf-8"),
            content_type="application/json",
            headers={"Authorization": f"Bearer {token if token is not None else self.token}"},
        )

    def test_score_1e400_returns_400(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": 1e400}}'
        resp = self._post_raw("/api/attempts", raw)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_score_negative_1e400_returns_400(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": -1e400}}'
        resp = self._post_raw("/api/attempts", raw)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_edition_id_1e400_in_body_returns_400(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": 1e400, "score": 10}}'
        resp = self._post_raw("/api/attempts", raw)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_huge_finite_score_rejected_by_max_score(self):
        raw = f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, "score": 1e308}}'
        resp = self._post_raw("/api/attempts", raw)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn(b"exceeds maximum", resp.data)

    def test_huge_finite_score_with_null_max_score_returns_400(self):
        body_json = json.dumps({
            "game_id": "no-cap-game", "edition_id": EDITION_ID, "score": 10 ** 30,
        })
        resp = self._post_raw("/api/attempts", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_huge_digit_string_edition_id_in_body_returns_400(self):
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": 10 ** 30, "score": 10,
        })
        resp = self._post_raw("/api/attempts", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_huge_digit_string_edition_id_in_query_returns_400(self):
        resp = self.client.get(f"/api/leaderboard?edition_id={10 ** 30}")
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_huge_digit_string_duration_ms_returns_400(self):
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 10,
            "duration_ms": 10 ** 30,
        })
        resp = self._post_raw("/api/attempts", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_duration_ms_infinite_returns_400(self):
        raw = (
            f'{{"game_id": "{GAME_ID}", "edition_id": {EDITION_ID}, '
            f'"score": 10, "duration_ms": 1e400}}'
        )
        resp = self._post_raw("/api/attempts", raw)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_duration_ms_wrong_type_list_returns_400(self):
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 10,
            "duration_ms": [1, 2, 3],
        })
        resp = self._post_raw("/api/attempts", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_duration_ms_wrong_type_string_returns_400(self):
        body_json = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 10,
            "duration_ms": "not-a-number",
        })
        resp = self._post_raw("/api/attempts", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_game_id_wrong_type_list_returns_400(self):
        body_json = json.dumps({
            "game_id": [1, 2, 3], "edition_id": EDITION_ID, "score": 10,
        })
        resp = self._post_raw("/api/attempts", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_register_email_wrong_type_returns_400(self):
        body_json = json.dumps({"email": [1, 2, 3], "display_name": "Test"})
        resp = self._post_raw("/api/auth/register", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_register_display_name_wrong_type_returns_400(self):
        body_json = json.dumps({
            "email": "typecheck@kpmg.com.au", "display_name": {"a": 1},
        })
        resp = self._post_raw("/api/auth/register", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_login_email_wrong_type_returns_400(self):
        body_json = json.dumps({"email": [1, 2, 3]})
        resp = self._post_raw("/api/auth/login", body_json)
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_end_to_end_register_login_submit_attempt_succeeds(self):
        register_body = json.dumps({
            "email": "e2e-roundtrip@kpmg.com.au", "display_name": "E2E Roundtrip",
        })
        resp = self._post_raw("/api/auth/register", register_body)
        self.assertEqual(resp.status_code, 201, resp.data)

        login_body = json.dumps({"email": "e2e-roundtrip@kpmg.com.au"})
        resp = self._post_raw("/api/auth/login", login_body)
        self.assertEqual(resp.status_code, 200, resp.data)
        login_token = json.loads(resp.data)["token"]

        attempt_body = json.dumps({
            "game_id": GAME_ID, "edition_id": EDITION_ID, "score": 500,
        })
        resp = self._post_raw("/api/attempts", attempt_body, token=login_token)
        self.assertEqual(resp.status_code, 201, resp.data)


if __name__ == "__main__":
    unittest.main()
