# KPMG Newsletter Minigames — Summary

## What It Is

A browser-based gaming platform embedded in the monthly KPMG PEPI newsletter. Staff authenticate with their `@kpmg.com.au` email and compete across 12 consulting-themed minigames, with scores tracked on a shared leaderboard. One game is featured per month, with 3 attempts allowed per player per edition.

## The 12 Games

| # | Game | Type | Theme | Controls |
|---|---|---|---|---|
| 1 | **Easter Egg Rush** | Endless runner (3-lane) | Easter-themed — dodge chocolate bunnies, collect eggs on a spring meadow | Swipe / Arrow keys |
| 2 | **Audit Ascent** | Jetpack side-scroller | Fly through red-flag obstacles, collect audit checkmarks and seals | Hold Space / tap to rise |
| 3 | **Flappy Brief** | Flappy Bird variant | Navigate a briefcase through regulation walls | Tap / Space to flap |
| 4 | **Deal Spell** | Hangman word game | Guess M&A and consulting terms letter by letter | Type / click keyboard |
| 5 | **Tax Tetris** | Tetris variant | Stack tax-type tetrominoes to clear rows and "lodge" returns | Arrow keys + Space |
| 6 | **Slide Deck Stacker** | Tower stacker | Stack consulting slides with precision — overhangs get trimmed | Tap / Space to drop |
| 7 | **Budget Blitz** | Whack-a-mole | Tap budget overruns before they expire across a 4x4 grid | Click / tap cells |
| 8 | **Merger Match** | Memory card matching | Match company pairs across escalating grid sizes (3 min timer) | Click / tap cards |
| 9 | **Risk Radar** | Asteroids/shield variant | Rotate a shield arc to deflect incoming risks on a radar | Arrow keys / drag |
| 10 | **Pipeline Plumber** | Pipe puzzle | Rotate pipe segments to connect LEAD source to WON sink | Click / tap to rotate |
| 11 | **KPI Catcher** | Paddle catcher | Catch green KPIs, dodge red vanity metrics, grab gold bonuses | Arrow keys / mouse |
| 12 | **Strategy Snake** | Snake variant | Collect strategic initiatives while avoiding scope creep walls | Arrow keys / swipe |

All games show a **How to Play** instructions screen before the countdown, with objective, controls, and a tip.

## How It Works

### Player Flow

1. Player receives the monthly newsletter with a link/QR code
2. Opens the hub page → logs in with their KPMG email
3. Sees this month's featured game (1 game per edition)
4. Reads the instructions screen → clicks Start
5. Plays the game (3-2-1 countdown → gameplay → score)
6. Gets 3 attempts total per game per edition — best score counts
7. Score appears on the shared leaderboard (per-edition + all-time views)

### Monthly Rotation

Each month, one game is activated. The schedule runs April 2026 to March 2027, then repeats or new editions are added.

| Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb | Mar |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Easter Egg Rush | Audit Ascent | Flappy Brief | Deal Spell | Tax Tetris | Slide Deck Stacker | Budget Blitz | Merger Match | Risk Radar | Pipeline Plumber | KPI Catcher | Strategy Snake |

Activation: `python3 manage.py activate 2026-05`

## Architecture

```
newsletter-games/
├── server.py              ← Python HTTP server + JSON API (stdlib only, no dependencies)
├── init_db.py             ← SQLite schema + seed data
├── manage.py              ← CLI: activate editions, export leaderboard, reset users
├── games.db               ← SQLite database (users, sessions, attempts, leaderboard)
├── index.html             ← Hub page (login, game grid, leaderboard)
├── assets/
│   ├── hub.css            ← KPMG-branded styles
│   ├── hub.js             ← Hub controller (SPA routing, game cards)
│   ├── auth.js            ← KPMG email auth + bearer token management
│   ├── leaderboard.js     ← ECharts leaderboard (KPMG theme registered)
│   └── game-engine.js     ← Shared engine (lifecycle, HUD, overlays, collision, input)
├── games/
│   └── <game-name>/
│       ├── index.html     ← Game page (header, canvas/DOM container, game-over overlay)
│       └── game.js        ← Game logic (update loop, draw, instructions config)
├── DEPLOY.md              ← PythonAnywhere deployment guide
├── DEPLOY-ORACLE.md       ← Oracle Cloud free-tier deployment guide
├── generate_qr.py         ← QR code generator for newsletter distribution
└── tests/test_smoke.py    ← Basic smoke tests
```

### Key Design Decisions

- **Zero external dependencies** — server.py uses only Python 3.8+ standard library
- **SQLite** — single-file database, no separate DB server needed
- **Static-compatible** — works on GitHub Pages in demo mode (no auth, no leaderboard, unlimited plays)
- **KPMG brand** — 8-colour palette enforced, ECharts `kpmg` theme, inline SVG logo
- **Mobile-first** — touch/swipe support, responsive canvas scaling, no-scroll game pages
- **3-attempt limit** — server-enforced per user/game/edition to maintain competition integrity

### Two Deployment Modes

| Mode | Auth | Leaderboard | Attempts | Backend |
|---|---|---|---|---|
| **Full** (server.py on PythonAnywhere/Oracle/Azure) | KPMG email + bearer tokens | Yes — per-edition + all-time | 3 per game (server-enforced) | Python HTTP + SQLite |
| **Static** (GitHub Pages) | Skipped — demo mode | Hidden | Unlimited | None — pure HTML/JS |

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register or login with KPMG email |
| GET | `/api/auth/me` | Get current user from bearer token |
| GET | `/api/editions/current` | Get active edition |
| GET | `/api/editions` | List all editions |
| GET | `/api/games` | List games in current edition |
| GET | `/api/attempts?game_id=&edition_id=` | Get user's attempts for a game |
| POST | `/api/attempts` | Submit a score (returns rank + remaining attempts) |
| GET | `/api/leaderboard?edition_id=` | Edition leaderboard |
| GET | `/api/leaderboard/all-time` | All-time aggregated leaderboard |

## Admin Operations

```bash
python3 manage.py status                    # Show editions, active game, player count
python3 manage.py activate 2026-05          # Activate May's game
python3 manage.py export-leaderboard        # CSV export
python3 manage.py reset-user name@kpmg.com.au  # Reset attempts for a user
python3 manage.py add-edition               # Add new edition interactively
python3 generate_qr.py --edition 2026-04 --base-url https://your-url.com
```

## Deployment Options

| Platform | Cost | Setup time | Guide |
|---|---|---|---|
| **PythonAnywhere** | Free | 10 min | `DEPLOY.md` |
| **Oracle Cloud** | Free (credit card for verification) | 30-45 min | `DEPLOY-ORACLE.md` |
| **Azure App Service F1** | Free (60 CPU-min/day limit) | 30 min | `DEPLOY.md` (Azure section) |
| **GitHub Pages** | Free | Already deployed | Demo mode only — no leaderboard |
