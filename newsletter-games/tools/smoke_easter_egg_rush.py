"""
Smoke test for Easter Egg Rush + sibling regression + responsive scaling.
Headless Chromium via Playwright. Saves PNGs + a JSON report.

Run: python newsletter-games/tools/smoke_easter_egg_rush.py
Assumes a server at http://localhost:8765 serving newsletter-games/.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "smoke-output"
OUT.mkdir(exist_ok=True)

BASE = "http://localhost:8765"

# Responsive scaling viewports — phones (portrait + landscape), tablet, laptops, desktops.
RESPONSIVE_VIEWPORTS = [
    ("iphone-se",        320,  568),
    ("galaxy-s5",        360,  640),
    ("iphone-13-pro",    390,  844),
    ("iphone-xr",        414,  896),
    ("iphone-landscape", 736,  414),
    ("ipad-portrait",    768, 1024),
    ("laptop-small",    1366,  768),
    ("desktop-1080p",   1920, 1080),
    ("desktop-qhd",     2560, 1440),
]


def smoke_easter():
    findings = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 480, "height": 800})
        page = ctx.new_page()
        console_msgs = []
        edition_requests = []
        page.on("console", lambda m: console_msgs.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: console_msgs.append(f"pageerror: {e}"))
        page.on("response", lambda r: edition_requests.append({"url": r.url, "status": r.status})
                if "edition.json" in r.url else None)

        page.goto(f"{BASE}/games/consultant-rush/", wait_until="networkidle")
        page.wait_for_timeout(800)

        # Capture the pre-game overlay (renderInstructions populates a flex div over the canvas)
        page.screenshot(path=str(OUT / "01-overlay.png"))

        # Dump the overlay's text + structure for verification
        overlay_text = page.evaluate(
            "() => { var el=document.querySelector('#instructions-overlay,.instructions-overlay,div'); "
            "var overlays = Array.from(document.querySelectorAll('div')).filter(d => "
            "  getComputedStyle(d).display==='flex' && d.textContent.includes('EASTER')); "
            "return overlays.length ? overlays[0].innerText : ''; }"
        )
        findings["overlay_text"] = overlay_text
        findings["overlay_has_collect_row"] = "COLLECT" in overlay_text
        findings["overlay_has_avoid_row"] = "AVOID" in overlay_text
        findings["overlay_has_easter_consultant"] = "Easter Consultant" in overlay_text
        findings["overlay_has_esc_pause"] = "ESC" in overlay_text
        findings["overlay_has_cracked_warning"] = "Cracked eggs are obstacles" in overlay_text
        findings["overlay_no_office_copy"] = "office obstacles" not in overlay_text
        findings["overlay_no_client_site"] = "client site" not in overlay_text

        # Click Start
        start_btn = page.get_by_role("button", name="START")
        if start_btn.count() > 0:
            start_btn.first.click()
        else:
            page.keyboard.press("Enter")
        page.wait_for_timeout(2000)

        # Capture mid-play
        page.screenshot(path=str(OUT / "02-midplay-2s.png"))

        # Probe HUD value via canvas — easier: read the GameEngine state
        hud_check = page.evaluate(
            "() => { return { score: window.GameEngine && window.GameEngine.state ? "
            "window.GameEngine.state.score : null }; }"
        )
        findings["hud_state_after_2s"] = hud_check

        edition_check = page.evaluate(
            "() => { var e = window.GameEngine && window.GameEngine._staticEdition; "
            "return e ? { slug: e.slug, maxAttempts: e.maxAttempts, "
            "featuredGameId: e.featuredGameId, closesAt: e.closesAt } : null; }"
        )
        findings["static_edition_loaded"] = edition_check is not None
        findings["static_edition"] = edition_check

        # Wait for Wave 2 (5s mark)
        page.wait_for_timeout(4000)
        page.screenshot(path=str(OUT / "03-midplay-6s.png"))

        # Wait for Wave 3 (10s)
        page.wait_for_timeout(5000)
        page.screenshot(path=str(OUT / "04-midplay-11s.png"))

        findings["console"] = console_msgs[:50]
        findings["edition_requests"] = edition_requests
        browser.close()
    return findings


def smoke_sibling(slug):
    """Confirm a sibling game's overlay does NOT show legend rows."""
    findings = {"slug": slug}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 480, "height": 800})
        page = ctx.new_page()
        page.on("console", lambda m: findings.setdefault("console", []).append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: findings.setdefault("console", []).append(f"pageerror: {e}"))
        page.goto(f"{BASE}/games/{slug}/", wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / f"sibling-{slug}.png"))
        text = page.evaluate(
            "() => { var overlays = Array.from(document.querySelectorAll('div')).filter(d => "
            "  getComputedStyle(d).display==='flex' && d.textContent.length>10); "
            "return overlays.length ? overlays[0].innerText : ''; }"
        )
        findings["overlay_text"] = text
        findings["has_collect_row"] = "COLLECT\n" in text or text.startswith("COLLECT")
        findings["has_avoid_row"] = "AVOID\n" in text or text.startswith("AVOID")
        browser.close()
    return findings


def smoke_responsive(slug, expected_aspect, max_width):
    """For each viewport: load game, measure canvas, assert no overflow + aspect preserved + fills space.

    expected_aspect is W/H (e.g. 400/700 ≈ 0.571 for Easter Egg Rush).
    max_width is the engine's maxWidth cap for this game (e.g. 720 for consultant-rush).
    """
    findings = {}
    out_dir = OUT / "responsive"
    out_dir.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for name, vw, vh in RESPONSIVE_VIEWPORTS:
            ctx = browser.new_context(viewport={"width": vw, "height": vh})
            page = ctx.new_page()
            page.goto(f"{BASE}/games/{slug}/", wait_until="networkidle")
            page.wait_for_timeout(400)  # let resize settle
            rect = page.evaluate(
                "() => { const c = document.getElementById('game-canvas');"
                "  if (!c) return null;"
                "  const r = c.getBoundingClientRect();"
                "  return {w: r.width, h: r.height, top: r.top, left: r.left,"
                "          right: r.right, bottom: r.bottom}; }"
            )
            page.screenshot(path=str(out_dir / f"{slug}-{name}-{vw}x{vh}.png"))
            entry = {"viewport": [vw, vh], "rect": rect}
            if rect and rect["h"] > 0:
                actual_aspect = rect["w"] / rect["h"]
                entry["no_overflow_x"] = rect["right"] <= vw + 0.5 and rect["left"] >= -0.5
                entry["no_overflow_y"] = rect["bottom"] <= vh + 0.5 and rect["top"] >= -0.5
                entry["aspect_ok"] = abs(actual_aspect - expected_aspect) / expected_aspect < 0.01
                # Fills at least one binding dimension: width within 4px of viewport,
                # height within 60px of (viewport - header), OR canvas width hits the
                # engine's maxWidth cap (designed-max — legitimate on huge monitors).
                entry["fills_some_dimension"] = (
                    abs(rect["w"] - vw) <= 4
                    or rect["h"] >= (vh - 60)
                    or abs(rect["w"] - max_width) <= 1
                )
            else:
                entry["no_overflow_x"] = False
                entry["no_overflow_y"] = False
                entry["aspect_ok"] = False
                entry["fills_some_dimension"] = False
            findings[name] = entry
            ctx.close()
        browser.close()
    return findings


if __name__ == "__main__":
    report = {"easter": smoke_easter()}
    for slug in ["audit-ascent", "strategy-snake", "kpi-catcher"]:
        report[f"sibling_{slug}"] = smoke_sibling(slug)
    report["responsive"] = smoke_responsive("consultant-rush", expected_aspect=400 / 700, max_width=720)
    out = OUT / "report.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out}")
    # ensure_ascii=True for the stdout summary so Windows cp1252 consoles don't choke on emoji.
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "console"} for k, v in report.items()}, indent=2, ensure_ascii=True))
