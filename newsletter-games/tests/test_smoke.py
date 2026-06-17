"""Smoke tests for the Newsletter Games project."""

import os
import unittest

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestNewsletterGamesSmoke(unittest.TestCase):
    """Verify that key project files exist."""

    EXPECTED_FILES = [
        "server.py",
        "index.html",
        "requirements.txt",
        "init_db.py",
        "manage.py",
    ]

    def test_expected_files_exist(self):
        """Key project files should be present."""
        for filename in self.EXPECTED_FILES:
            path = os.path.join(PROJECT_DIR, filename)
            self.assertTrue(
                os.path.isfile(path),
                f"Expected file missing: {filename}",
            )

    def test_server_module_exists(self):
        """server.py should exist and be non-empty."""
        server_path = os.path.join(PROJECT_DIR, "server.py")
        self.assertTrue(os.path.isfile(server_path))
        self.assertGreater(
            os.path.getsize(server_path), 0, "server.py should not be empty"
        )

    def test_penalty_pressure_game_present(self):
        """June 2026 'After-Hours Shootout' game files exist and are registered."""
        game_dir = os.path.join(PROJECT_DIR, "games", "penalty-pressure")
        for fname in ("index.html", "game.js", "audio.js"):
            path = os.path.join(game_dir, fname)
            self.assertTrue(
                os.path.isfile(path),
                f"Expected penalty-pressure file missing: {fname}",
            )
            self.assertGreater(
                os.path.getsize(path), 0, f"{fname} should not be empty"
            )

    def test_penalty_pressure_seeded(self):
        """penalty-pressure is seeded as a game and featured by the 2026-06 edition."""
        with open(os.path.join(PROJECT_DIR, "init_db.py"), encoding="utf-8") as fh:
            seed = fh.read()
        self.assertIn('"penalty-pressure", "Penalty Pressure"', seed)
        self.assertIn('"2026-06"', seed)
        # the June edition row must point at the new game
        self.assertIn('"penalty-pressure",     0, "2026-07-31"', seed)


if __name__ == "__main__":
    unittest.main()
