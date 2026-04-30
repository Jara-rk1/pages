"""
Smoke test for Easter Egg Rush + sibling regression.
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


def smoke_easter():
    findings = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 480, "height": 800})
        page = ctx.new_page()
        console_msgs = []
        page.on("console", lambda m: console_msgs.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: console_msgs.append(f"pageerror: {e}"))

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

        # Wait for Wave 2 (5s mark)
        page.wait_for_timeout(4000)
        page.screenshot(path=str(OUT / "03-midplay-6s.png"))

        # Wait for Wave 3 (10s)
        page.wait_for_timeout(5000)
        page.screenshot(path=str(OUT / "04-midplay-11s.png"))

        findings["console"] = console_msgs[:50]
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


if __name__ == "__main__":
    report = {"easter": smoke_easter()}
    for slug in ["audit-ascent", "strategy-snake", "kpi-catcher"]:
        report[f"sibling_{slug}"] = smoke_sibling(slug)
    out = OUT / "report.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out}")
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "console"} for k, v in report.items()}, indent=2, ensure_ascii=False))
