"""
Regression probe: exactly one countdown and one game loop per round.

game-engine.js renderInstructions() binds a document keydown handler that starts
the game on Space or Enter and unbinds it only when IT fires. Clicking the START
button ran the same callback without unbinding, so the player's first Space - the
control the instructions overlay itself tells them to use - re-entered
startCountdownAndLoop(). The 3-2-1 countdown replayed over the live game and a
second rAF chain was spawned alongside the first, doubling the effective clock
for the rest of the round. All 14 games share the engine.

This probe drives the exact player sequence (pointer START, then Space) on every
game and asserts:

  * renderCountdown ran once, not twice
  * the game loop advances once per animation frame, not twice

Run against a server rooted at newsletter-games/:

    python -m http.server 8765 --bind 127.0.0.1 --directory newsletter-games
    python newsletter-games/tools/probe_double_loop.py --url http://127.0.0.1:8765

Exit 0 when every game passes.
"""
import argparse
import json
import sys

from playwright.sync_api import sync_playwright

# 13 canvas games plus the 2 DOM games, which have no ctx and therefore no rAF
# loop to double - they still run a countdown, so they still prove the unbind.
CANVAS_GAMES = [
    "audit-ascent",
    "budget-blitz",
    "consultant-rush",
    "flappy-brief",
    "kpi-catcher",
    "penalty-pressure",
    "pipeline-plumber",
    "red-carpet-rush",
    "risk-radar",
    "slide-deck-stacker",
    "strategy-snake",
    "tax-tetris",
    "multiplex",
]
DOM_GAMES = ["deal-spell", "merger-match"]

# COUNTDOWN_STEP_MS (800) x 4 steps, plus slack for a replayed countdown to have
# finished too - a probe that measured while a second countdown was still running
# would under-report the doubling.
COUNTDOWN_SETTLE_MS = 4500
MEASURE_FRAMES = 60

PROBE_SCRIPT = """
() => {
  if (!window.GameEngine) return false;
  if (window.__probeInstalled) return true;

  window.__loopCalls = 0;
  window.__countdowns = 0;
  // Every rAF callback in one animation frame receives an identical timestamp,
  // so N game-loop calls sharing a timestamp means N live loop chains. This is
  // instantaneous, unlike a rate measured over a window, so it still reports on
  // the games that end a second into an unplayed round.
  window.__maxChains = 0;
  let lastT = null;
  let sameT = 0;

  const origLoop = GameEngine.gameLoop;
  GameEngine.gameLoop = function (t) {
    window.__loopCalls++;
    sameT = (t === lastT) ? sameT + 1 : 1;
    lastT = t;
    if (sameT > window.__maxChains) window.__maxChains = sameT;
    return origLoop.call(this, t);
  };

  const origCountdown = GameEngine.renderCountdown;
  GameEngine.renderCountdown = function (n, cb) {
    window.__countdowns++;
    return origCountdown.call(this, n, cb);
  };

  // The measuring ticker is its own rAF chain and never touches __loopCalls,
  // so calls-per-frame is exactly the number of live game-loop chains.
  window.__measure = (frames) => new Promise((resolve) => {
    const before = window.__loopCalls;
    let n = 0;
    const tick = () => {
      n++;
      if (n >= frames) resolve({ frames: n, calls: window.__loopCalls - before });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  window.__probeInstalled = true;
  return true;
}
"""


def poll(page, expr, message, tries=100, gap=100):
    for _ in range(tries):
        if page.evaluate(expr):
            return
        page.wait_for_timeout(gap)
    raise RuntimeError(message)


def probe_game(ctx, base, slug, is_canvas):
    page = ctx.new_page()
    console = []
    page.on("console", lambda m: console.append(f"{m.type}: {m.text}")
            if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: console.append(f"pageerror: {e}"))

    result = {"game": slug, "canvas": is_canvas}
    try:
        page.goto(f"{base}/games/{slug}/", wait_until="domcontentloaded")
        poll(page, "() => !!window.GameEngine", "engine never initialised")
        if not page.evaluate(PROBE_SCRIPT):
            raise RuntimeError("probe failed to install")

        start = page.locator(".game-over-overlay button", has_text="START")
        start.wait_for(state="visible", timeout=15000)

        # The player's sequence: pointer START, then Space for the first action.
        start.click()
        page.wait_for_timeout(250)
        page.keyboard.press("Space")

        page.wait_for_timeout(COUNTDOWN_SETTLE_MS)

        state = page.evaluate(
            "() => ({running: !!GameEngine.state.running,"
            " gameOver: !!GameEngine.state.gameOver})")
        measured = page.evaluate(
            "(n) => window.__measure(n)", MEASURE_FRAMES)

        totals = page.evaluate(
            "() => ({countdowns: window.__countdowns,"
            " maxChains: window.__maxChains, total: window.__loopCalls})")

        result.update({
            "countdowns": totals["countdowns"],
            "maxChains": totals["maxChains"],
            "totalLoopCalls": totals["total"],
            "windowFrames": measured["frames"],
            "windowLoopCalls": measured["calls"],
            "running": state["running"],
            "gameOver": state["gameOver"],
            "console": console[:5],
        })
        # Secondary signal, only meaningful while the round is still running.
        result["rate"] = (round(measured["calls"] / measured["frames"], 2)
                          if state["running"] else None)

        if totals["countdowns"] != 1:
            result["verdict"] = f"FAIL countdown ran {totals['countdowns']}x"
        elif not is_canvas:
            result["verdict"] = "PASS" if totals["total"] == 0 else \
                f"FAIL DOM game ran {totals['total']} loop calls"
        elif totals["total"] == 0:
            result["verdict"] = "INCONCLUSIVE loop never ran"
        elif totals["maxChains"] != 1:
            result["verdict"] = f"FAIL {totals['maxChains']} live loop chains"
        # One chain drops the odd frame under load; two chains cannot land here.
        elif result["rate"] is not None and not (0.8 <= result["rate"] <= 1.2):
            result["verdict"] = f"FAIL {result['rate']} loop calls per frame"
        else:
            result["verdict"] = "PASS"
    except Exception as exc:  # noqa: BLE001 - probe reports, never raises
        result["verdict"] = f"ERROR {type(exc).__name__}: {exc}"
    finally:
        page.close()
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8765")
    ap.add_argument("--json", help="write full results here")
    ap.add_argument("--game", action="append", help="probe only these slugs")
    args = ap.parse_args()

    base = args.url.rstrip("/")
    games = [(g, True) for g in CANVAS_GAMES] + [(g, False) for g in DOM_GAMES]
    if args.game:
        games = [(g, c) for g, c in games if g in args.game]

    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 800, "height": 900})
        for slug, is_canvas in games:
            r = probe_game(ctx, base, slug, is_canvas)
            results.append(r)
            print(f"{r['verdict']:<32} {slug:<20} "
                  f"countdowns={r.get('countdowns', '?')} "
                  f"maxChains={r.get('maxChains', '?')} "
                  f"rate={r.get('rate', '-')}")
        browser.close()

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"url": base, "results": results}, fh, indent=2)

    failures = [r for r in results if not r["verdict"].startswith("PASS")]
    print(f"\n{len(results) - len(failures)}/{len(results)} passed")
    for r in failures:
        print(f"  {r['game']}: {r['verdict']}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
