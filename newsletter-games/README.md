# Newsletter Games

Browser-based minigames platform for KPMG newsletter engagement. Staff authenticate with their `@kpmg.com.au` email and compete on a shared leaderboard across 12 consulting-themed games.

### Games

| Game | Description |
|---|---|
| Audit Ascent | Climbing/platformer |
| Budget Blitz | Budget management |
| Consultant Rush | Speed challenge |
| Deal Spell | Word/spelling game |
| Flappy Brief | Flappy Bird variant |
| KPI Catcher | Catching game |
| Merger Match | Memory matching |
| Pipeline Plumber | Pipe-connection puzzle |
| Risk Radar | Risk identification |
| Slide Deck Stacker | Stacking game |
| Strategy Snake | Snake variant |
| Tax Tetris | Tetris variant |

### Quick Start

```bash
cd newsletter-games
python init_db.py          # Initialise SQLite database
python server.py           # Start HTTP server
```

### Architecture

- `server.py` — Lightweight HTTP server with JSON API (stdlib, same pattern as HORIZON)
- `init_db.py` — Database initialisation
- `index.html` — Game hub landing page
- `assets/` — Shared CSS (`hub.css`), JS (`hub.js`, `auth.js`, `leaderboard.js`, `game-engine.js`)
- `games/` — 12 game directories, each with `index.html` and `game.js`
- `games.db` — SQLite database for scores and authentication

### Deployment

See `DEPLOY.md` for Azure deployment instructions. Includes `deploy_azure.sh`, `wsgi.py`, `startup.sh`, and `requirements.txt`.

Alternatively, run locally with `run_server.bat` or install as a Windows service with `install_service.bat`.
