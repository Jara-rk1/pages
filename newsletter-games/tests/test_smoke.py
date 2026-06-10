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


if __name__ == "__main__":
    unittest.main()
