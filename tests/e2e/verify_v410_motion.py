#!/usr/bin/env python3
"""Targeted Playwright motion, launch, scroll-dock & indicator regression test for v4.1.0."""
from __future__ import annotations

import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

HOST = "127.0.0.1"
PORT = 4175
URL = f"http://{HOST}:{PORT}"
REPO_WSL = "/home/kostia/projects/rozklad"
ARTIFACT_DIR = Path(os.environ.get("V410_ARTIFACT_DIR", "."))


def wait_ready(url: str, timeout: float = 25.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 300:
                    return
        except Exception:
            pass
        time.sleep(0.3)
    raise RuntimeError(f"Preview server not ready at {url}")


def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(
        ["wsl", "-e", "bash", "-lc", f"export PATH=\"$HOME/.local/node/bin:$PATH\" && cd {REPO_WSL} && npx vite preview --host {HOST} --port {PORT} --strictPort"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_ready(URL)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 390, "height": 844})
            ctx.add_init_script(
                "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp'}));"
            )
            page = ctx.new_page()

            # 1. Verify ~2500ms AppSplash launch lifecycle
            t0 = time.time()
            page.goto(URL, wait_until="domcontentloaded")
            splash = page.locator('[data-launch-phase]')
            splash.wait_for(state="visible", timeout=2000)
            page.wait_for_timeout(600)
            page.screenshot(path=str(ARTIFACT_DIR / "v410_splash.png"))
            expect(splash).to_be_visible()
            splash.wait_for(state="detached", timeout=4000)
            elapsed_ms = int((time.time() - t0) * 1000)
            assert elapsed_ms >= 1800, f"Splash finished too quickly: {elapsed_ms}ms"
            print(f"PASS 1: AppSplash choreographed launch completed in {elapsed_ms}ms")

            # 2. Verify BottomNav expanded state & zero glassmorphism
            nav = page.locator('nav[aria-label="Мобільна навігація"]')
            expect(nav).to_be_visible()
            page.wait_for_timeout(450)
            expect(nav).to_have_attribute("data-dock-state", "expanded")
            backdrop = nav.evaluate("el => getComputedStyle(el).backdropFilter")
            assert backdrop in ("none", "", None), f"Unexpected glassmorphism backdropFilter: {backdrop}"
            box_expanded = nav.bounding_box()
            assert box_expanded is not None
            page.screenshot(path=str(ARTIFACT_DIR / "v410_dock_expanded.png"))

            # Navigate to Settings (tall scrollable page)
            nav.get_by_role("button", name="Опції").click()
            page.wait_for_timeout(450)
            expect(page.get_by_text("Uni Schedule v4.2.1")).to_be_visible()
            assert page.get_by_text("Graphite Glass").count() == 0, "Obsolete Graphite Glass text still present"
            assert page.get_by_text("uni-schedule 2.0").count() == 0, "Obsolete v2.0 text still present"
            print("PASS 2: Settings v4.1.0 branding clean & no glassmorphism on dock")

            # 3. Verify scroll-responsive dock compression & expansion
            page.evaluate("window.scrollTo(0, 420)")
            page.wait_for_timeout(500)
            expect(nav).to_have_attribute("data-dock-state", "compact")
            box_compact = nav.bounding_box()
            assert box_compact is not None
            assert box_compact["width"] < box_expanded["width"] - 10, f"Dock did not compress width: {box_compact} vs {box_expanded}"
            assert box_compact["height"] <= 52, f"Compact dock height too tall: {box_compact['height']}"
            page.screenshot(path=str(ARTIFACT_DIR / "v410_dock_compact.png"))

            # 4. Verify active indicator stays in dock coordinates when switching tabs while deeply scrolled
            ind = page.locator('[data-testid="mobile-nav-indicator"]')
            ind_before = ind.bounding_box()
            assert ind_before is not None
            nav.get_by_role("button", name="Розклад").click()
            page.wait_for_timeout(120)
            ind_mid = ind.bounding_box()
            page.wait_for_timeout(350)
            ind_after = ind.bounding_box()
            assert ind_mid is not None and ind_after is not None
            assert abs(ind_mid["y"] - ind_before["y"]) < 14, f"Indicator flew vertically mid-transition: {ind_before['y']} -> {ind_mid['y']}"
            assert abs(ind_after["y"] - ind_before["y"]) < 14, f"Indicator misaligned vertically: {ind_before['y']} -> {ind_after['y']}"
            assert ind_after["x"] < ind_before["x"] - 80, f"Indicator did not slide horizontally from tab 5 to tab 1: {ind_before['x']} -> {ind_after['x']}"
            scroll_after = page.evaluate("window.scrollY")
            assert scroll_after == 0, f"Scroll did not reset on tab switch: {scroll_after}"
            expect(nav).to_have_attribute("data-dock-state", "expanded")
            print(f"PASS 3: Dynamic dock ({int(box_expanded['width'])}x{int(box_expanded['height'])} -> {int(box_compact['width'])}x{int(box_compact['height'])}) & horizontal indicator (scrollY={scroll_after})")

            # 5. Verify no splash replay on tab switching
            assert page.locator('[data-launch-phase]').count() == 0, "Splash replayed on tab switch!"
            print("PASS 4: No splash replay on tab switching")

            browser.close()
        print("ALL V4.1.0 MOTION & INTERACTION CHECKS PASSED!")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()


if __name__ == "__main__":
    main()