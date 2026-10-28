# KPMG Newsletter Minigames — Summary

## What It Is

A browser-based gaming platform embedded in the monthly KPMG PEPI newsletter. Staff authenticate with their `@kpmg.com.au` email and compete across 17 themed minigames (source of truth: `SEED_GAMES` in `init_db.py`), with scores tracked on a shared leaderboard. One game is featured per month, with 3 attempts allowed per player per edition.

## The Games

The table below predates the later additions: Field Goal at the 'G, MULTIPLEX and Ghosts on Mute are not listed. `SEED_GAMES` in `init_db.py` is authoritative (17 games).

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
| 13 | **After-Hours Shootout** | Penalty shootout | Two-tap aim and power vs a read-AI keeper, 10 World Cup penalties | Tap / Space x2 |
| 14 | **FLASH! Red Carpet Rush** | Paparazzi timing | MIFF opening night: hold to rack focus, release to fire the shutter, catch them mid-pose | Hold / release tap or Space |

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

Each month, one game is activated. The schedule runs April 2026 to August 2027 (`SEED_EDITIONS` in `init_db.py` is authoritative; the table shows the original April 2026 to May 2027 run, with later displacements below). Every registered game holds exactly one slot.

| Apr 26 | May 26 | Jun 26 | Jul 26 | Aug 26 | Sep 26 | Oct 26 | Nov 26 | Dec 26 | Jan 27 | Feb 27 | Mar 27 | Apr 27 | May 27 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Easter Egg Rush | Audit Ascent | After-Hours Shootout | Deal Spell | **FLASH! Red Carpet Rush** | MULTIPLEX | Field Goal | Ghosts on Mute | Risk Radar | Pipeline Plumber | KPI Catcher | Strategy Snake | Slide Deck Stacker | Flappy Brief |

Slide Deck Stacker was displaced from September 2026 by MULTIPLEX and moved to April 2027. Tax Tetris was displaced from April 2027 by Slide Deck Stacker and moved to June 2027. Budget Blitz and Merger Match were displaced from October and November 2026 by Field Goal and Ghosts on Mute and moved to July and August 2027.
Flappy Brief lost the June 2026 slot to After-Hours Shootout and was never rescheduled, so it
held no slot at all until May 2027 was added on 2026-07-27.

Activation: `python3 manage.py activate 2026-08`

> **Re-pointing an edition on a live database.** `init_db.py` seeds with
> `INSERT OR IGNORE`, so changing a `SEED_EDITIONS` row does not by itself update
> an existing `games.db`, so the old game would still go live on activation. The
> seeder therefore reconciles `game_id` for any edition that is inactive and has
> no recorded attempts, and prints what it changed. Editions that are live or
> already played are never rewritten.

## Architecture

```
internal/newsletter/games/
├── server.py              ← Python HTTP server + JSON API (stdlib only)
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

- **server.py is stdlib-only** (Python 3.8+); the Azure/WSGI path (`wsgi.py`) needs Flask and gunicorn (`requirements.txt`, not shipped in this repo)
- **SQLite** — single-file database, no separate DB server needed
- **Static-compatible** — works on GitHub Pages in demo mode (no auth, no leaderboard, unlimited plays)
- **KPMG brand**: 8-colour palette enforced except MULTIPLEX (approved brand deviation, 2026-08-26), ECharts `kpmg` theme, inline SVG logo
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
| POST | `/api/auth/login` | Log in with KPMG email |
| POST | `/api/auth/logout` | End the session |
| GET | `/api/auth/me` | Get current user from bearer token |
| GET | `/api/editions/current` | Get active edition |
| GET | `/api/editions` | List all editions |
| GET | `/api/games` | List games in current edition |
| GET | `/api/games/<id>` | Get one game |
| GET | `/api/attempts?game_id=&edition_id=` | Get user's attempts for a game |
| POST | `/api/attempts` | Submit a score (returns rank + remaining attempts) |
| GET | `/api/leaderboard?edition_id=` | Edition leaderboard |
| GET | `/api/leaderboard/all-time` | All-time aggregated leaderboard |
| GET | `/api/leaderboard/me` | Current user's leaderboard standing |

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
