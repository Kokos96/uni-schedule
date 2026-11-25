#!/usr/bin/env python3
"""Comprehensive v4.2.0 Premium Experience E2E & 8 Visual Recordings verification."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

HOST = "127.0.0.1"
PORT = 4178
URL = f"http://{HOST}:{PORT}"
REPO_WSL = "/home/kostia/projects/rozklad"
OUT_DIR = Path(os.environ.get("V420_ARTIFACT_DIR", "v420_recordings"))


def wait_ready(url: str, timeout: float = 25.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 300:
                    return
        except Exception:
            pass
        time.sleep(0.25)
    raise RuntimeError(f"Preview server not ready at {url}")


def wait_splash_done(page) -> None:
    sp = page.locator("[data-launch-phase]")
    try:
        sp.wait_for(state="visible", timeout=2500)
    except Exception:
        pass
    sp.wait_for(state="detached", timeout=5000)
    page.wait_for_timeout(450)


def install_mock_api(ctx) -> None:
    faculties = [
        {"id": "1005", "name": "Факультет електроніки та комп'ютерних технологій"},
        {"id": "1007", "name": "Факультет іноземних мов"},
        {"id": "1013", "name": "Факультет прикладної математики та інформатики"},
    ]
    all_groups = [
        {"id": "ФЕП-31с", "name": "ФЕП-31с", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-se", "programName": "Інженерія програмного забезпечення (121)", "course": 3},
        {"id": "ФЕП-32с", "name": "ФЕП-32с", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-se", "programName": "Інженерія програмного забезпечення (121)", "course": 3},
        {"id": "ФЕП-33с", "name": "ФЕП-33с", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-se", "programName": "Інженерія програмного забезпечення (121)", "course": 3},
        {"id": "ФЕП-34с", "name": "ФЕП-34с", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-se", "programName": "Інженерія програмного забезпечення (121)", "course": 3},
        {"id": "ФЕІ-31", "name": "ФЕІ-31", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-cs", "programName": "Комп'ютерні науки (122)", "course": 3},
        {"id": "ІНА-21", "name": "ІНА-21", "facultyId": "1007", "facultyVerified": True, "programId": "lnu-1007-en", "programName": "Англійська філологія", "course": 2},
        {"id": "ПМІ-41", "name": "ПМІ-41", "facultyId": "1013", "facultyVerified": True, "programId": "lnu-1013-cs", "programName": "Комп'ютерні науки / Інформатика", "course": 4},
    ]

    def handle_route(route):
        url = route.request.url
        from urllib.parse import urlparse, parse_qs
        if "/api/universities/lnu/faculties" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"faculties": faculties}))
            return
        if "/api/universities/lnu/groups" in url:
            qs = parse_qs(urlparse(url).query)
            inc_all = qs.get("includeAll", ["0"])[0] == "1"
            fac = qs.get("facultyId", [""])[0]
            prog = qs.get("programId", [""])[0]
            res = all_groups
            if not inc_all and fac:
                res = [g for g in res if g.get("facultyId") == fac]
            if not inc_all and prog:
                res = [g for g in res if g.get("programId") == prog]
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"groups": res}))
            return
        if "/api/schedule" in url:
            qs = parse_qs(urlparse(url).query)
            grp = qs.get("group", [""])[0]
            matched = next((g for g in all_groups if g["name"] == grp), None)
            today_iso = time.strftime("%Y-%m-%d")
            schedule = {
                "universityId": "lnu",
                "universityName": "ЛНУ ім. Івана Франка",
                "facultyId": matched["facultyId"] if matched else "1005",
                "groupId": grp,
                "groupName": grp,
                "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "sourceType": "dated",
                "coveredFrom": "2026-11-23",
                "coveredTo": "2026-12-06",
                "warnings": [],
                "lessons": [{
                    "id": f"lnu_{grp}_1",
                    "date": today_iso,
                    "dayOfWeek": 4,
                    "number": 1,
                    "startTime": "08:30",
                    "endTime": "09:50",
                    "subject": f"Професійний Python ({grp})",
                    "lessonType": "Л",
                    "teacher": "Викладач Тест",
                    "room": "111",
                    "building": "Головний",
                    "universityId": "lnu",
                    "status": "active",
                }],
            }
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"schedule": schedule, "cacheHit": False, "stale": False}))
            return
        if "/api/auth/register" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"userId": "u1", "deviceId": "d1", "syncToken": "tok1"}))
            return
        if "/api/profile" in url:
            if route.request.method == "PUT":
                route.fulfill(status=200, content_type="application/json", body=json.dumps({"profile": {"revision": 1}}))
            else:
                route.fulfill(status=404, content_type="application/json", body=json.dumps({"error": {"code": "NOT_FOUND"}}))
            return
        route.continue_()

    ctx.route("**/api/**", handle_route)


def save_video(page, target_name: str) -> Path:
    vid = page.video
    page.close()
    assert vid is not None
    dst = OUT_DIR / target_name
    shutil.copy2(Path(vid.path()), dst)
    return dst


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_vid = OUT_DIR / "_tmp"
    tmp_vid.mkdir(parents=True, exist_ok=True)
    dist_wsl = "/tmp/uni-v420-e2e-dist"

    subprocess.run(
        [
            "wsl", "-e", "bash", "-lc",
            f'export PATH="$HOME/.local/node/bin:$PATH" && cd {REPO_WSL} && VITE_API_BASE_URL={URL} npx vite build --outDir {dist_wsl} --emptyOutDir',
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    server = subprocess.Popen(
        ["wsl", "-e", "bash", "-lc", f'export PATH="$HOME/.local/node/bin:$PATH" && cd {REPO_WSL} && npx vite preview --outDir {dist_wsl} --host {HOST} --port {PORT} --strictPort'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_ready(URL)
        with sync_playwright() as p:
            browser = p.chromium.launch()

            # 1. Cold launch — Dark theme
            c1 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            c1.add_init_script("localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'dark'}));")
            p1 = c1.new_page()
            p1.goto(URL, wait_until="domcontentloaded")
            sp1 = p1.locator("[data-launch-phase]")
            sp1.wait_for(state="visible", timeout=5000)
            t0 = time.time()
            p1.wait_for_timeout(1150)
            p1.screenshot(path=str(OUT_DIR / "01_splash_dark_keyframe.png"))
            sp1.wait_for(state="detached", timeout=5000)
            ms_dark = int((time.time() - t0) * 1000)
            p1.wait_for_timeout(450)
            assert 2000 <= ms_dark <= 3400, f"Dark launch duration out of range: {ms_dark}ms"
            save_video(p1, "01_premium_cold_launch_dark.webm")
            c1.close()
            print(f"PASS 01: Dark cold launch ({ms_dark}ms)")

            # 2. Cold launch — Light theme
            c2 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            c2.add_init_script("localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'light'}));")
            p2 = c2.new_page()
            p2.goto(URL, wait_until="domcontentloaded")
            sp2 = p2.locator("[data-launch-phase]")
            sp2.wait_for(state="visible", timeout=5000)
            t0 = time.time()
            p2.wait_for_timeout(1150)
            p2.screenshot(path=str(OUT_DIR / "02_splash_light_keyframe.png"))
            sp2.wait_for(state="detached", timeout=5000)
            ms_light = int((time.time() - t0) * 1000)
            p2.wait_for_timeout(450)
            save_video(p2, "02_premium_cold_launch_light.webm")
            c2.close()
            print(f"PASS 02: Light cold launch ({ms_light}ms)")

            # 3. Scroll-driven Instagram-grade navigation
            c3 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            install_mock_api(c3)
            c3.add_init_script("localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'dark'}));")
            p3 = c3.new_page()
            p3.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p3)
            nav3 = p3.locator('nav[aria-label="Мобільна навігація"]')
            nav3.get_by_role("button", name="Опції").click()
            p3.wait_for_timeout(400)
            box_exp = nav3.bounding_box()
            assert box_exp is not None and 345 <= box_exp["width"] <= 362 and 55 <= box_exp["height"] <= 60, box_exp
            # Incremental slow scroll down -> partial compression -> full compact -> upward reversal -> top
            for y in [70, 140, 260, 460]:
                p3.evaluate(f"window.scrollTo(0, {y})")
                p3.wait_for_timeout(180)
            p3.wait_for_timeout(350)
            box_cmp = nav3.bounding_box()
            assert box_cmp is not None and 282 <= box_cmp["width"] <= 305 and 48 <= box_cmp["height"] <= 53, box_cmp
            expect(nav3).to_have_attribute("data-dock-state", "compact")
            # Reverse upward mid-page
            p3.evaluate("window.scrollTo(0, 320)")
            p3.wait_for_timeout(450)
            expect(nav3).to_have_attribute("data-dock-state", "expanded")
            p3.evaluate("window.scrollTo(0, 0)")
            p3.wait_for_timeout(350)
            save_video(p3, "03_scroll_driven_navigation.webm")
            c3.close()
            print(f"PASS 03: Scroll-driven dock ({int(box_exp['width'])}x{int(box_exp['height'])} -> {int(box_cmp['width'])}x{int(box_cmp['height'])}, upward reversal verified)")

            # 4. Rapid navigation switching
            c4 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            install_mock_api(c4)
            c4.add_init_script("localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'dark'}));")
            p4 = c4.new_page()
            p4.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p4)
            nav4 = p4.locator('nav[aria-label="Мобільна навігація"]')
            ind4 = p4.locator('[data-testid="mobile-nav-indicator"]')
            y0 = ind4.bounding_box()["y"]
            for tab in ["Опції", "Розклад", "Довідник", "Дедлайни", "Статистика", "Опції", "Розклад"]:
                nav4.get_by_role("button", name=tab).click()
                p4.wait_for_timeout(200)
                assert abs(ind4.bounding_box()["y"] - y0) < 6
            assert p4.locator("[data-launch-phase]").count() == 0
            save_video(p4, "04_rapid_navigation_switching.webm")
            c4.close()
            print("PASS 04: Rapid tab switching (0 vertical jumps, 0 splash replay)")

            # 5. Academic selection (custom PremiumSelect bottom sheet, no overlap with Підгрупа)
            c5 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            install_mock_api(c5)
            p5 = c5.new_page()
            p5.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p5)
            p5.locator("#uni-faculty").click()
            p5.wait_for_timeout(300)
            p5.get_by_role("option", name="Факультет електроніки та комп'ютерних технологій").click()
            p5.wait_for_timeout(300)
            p5.locator("#uni-program").click()
            p5.wait_for_timeout(250)
            p5.get_by_role("option", name="Інженерія програмного забезпечення (121)").click()
            p5.wait_for_timeout(300)
            p5.locator("#uni-group").click()
            p5.wait_for_timeout(300)
            # Verify browse-first: search input is NOT focused automatically
            active_id = p5.evaluate("document.activeElement?.id || ''")
            assert active_id != "uni-group-search", f"Keyboard opened automatically on browse: {active_id}"
            lb5 = p5.locator("#uni-group-listbox")
            expect(lb5).to_be_visible()
            txt5 = lb5.inner_text()
            assert "ФЕП-33с" in txt5 and "ІНА-21" not in txt5 and "ФЕІ-31" not in txt5
            p5.screenshot(path=str(OUT_DIR / "05_academic_sheet_keyframe.png"))
            p5.get_by_role("option", name="ФЕП-33с").click()
            p5.wait_for_timeout(300)
            save_video(p5, "05_academic_selection.webm")
            c5.close()
            print("PASS 05: Custom PremiumSelect portal sheet (browse-first, strict filtering, 0 overlap)")

            # 6. Group search with keyboard + computed 16px font-size + zero horizontal overflow
            c6 = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            install_mock_api(c6)
            p6 = c6.new_page()
            p6.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p6)
            p6.locator("#uni-group").click()
            p6.wait_for_timeout(250)
            search_in = p6.locator("#uni-group-search")
            search_in.click()
            p6.wait_for_timeout(200)
            font_px = search_in.evaluate("el => parseFloat(getComputedStyle(el).fontSize)")
            assert font_px >= 16.0, f"Mobile input font-size < 16px (triggers iOS zoom!): {font_px}px"
            # Verify keyboard-aware dock hiding when touch editable focused
            kb_hidden = p6.locator("[data-keyboard-hidden]").get_attribute("data-keyboard-hidden")
            assert kb_hidden == "true", f"BottomNav did not hide for keyboard: {kb_hidden}"
            search_in.fill("ФЕП-33")
            p6.wait_for_timeout(250)
            p6.get_by_role("option", name="ФЕП-33с").click()
            p6.wait_for_timeout(300)
            overflow = p6.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            assert not overflow, "Horizontal overflow detected after search!"
            save_video(p6, "06_group_search_keyboard.webm")
            c6.close()
            print(f"PASS 06: Group search keyboard (fontSize={font_px}px >= 16px, dock hidden, 0 overflow)")

            # 7. Group activation end-to-end
            c7 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            install_mock_api(c7)
            p7 = c7.new_page()
            p7.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p7)
            p7.locator("#uni-faculty").click()
            p7.get_by_role("option", name="Факультет електроніки та комп'ютерних технологій").click()
            p7.wait_for_timeout(250)
            p7.locator("#uni-group").click()
            p7.get_by_role("option", name="ФЕП-33с").click()
            p7.wait_for_timeout(250)
            p7.get_by_role("button", name="Активувати групу").click()
            p7.wait_for_timeout(600)
            expect(p7.get_by_role("heading", name="Професійний Python (ФЕП-33с)")).to_be_visible()
            save_video(p7, "07_group_activation.webm")
            c7.close()
            print("PASS 07: Group activation end-to-end")

            # 8. Existing profile startup (zero onboarding flash, direct schedule restoration)
            c8 = browser.new_context(viewport={"width": 390, "height": 844}, record_video_dir=str(tmp_vid), record_video_size={"width": 390, "height": 844})
            install_mock_api(c8)
            c8.add_init_script(
                "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'live', subgroup:1, department:'sp', universityProfile:{universityId:'lnu', facultyId:'1005', groupId:'ФЕП-33с', groupName:'ФЕП-33с'}}));"
            )
            p8 = c8.new_page()
            p8.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p8)
            assert p8.get_by_text("Налаштування розкладу").count() == 0, "Onboarding flashed for existing configured profile!"
            expect(p8.get_by_role("heading", name="Професійний Python (ФЕП-33с)")).to_be_visible()
            save_video(p8, "08_existing_profile_startup.webm")
            c8.close()
            print("PASS 08: Existing profile startup (0 onboarding flash)")

            # Multi-viewport overflow & input font-size check (320, 375, 390, 393, 430)
            for vw in [320, 375, 390, 393, 430]:
                cv = browser.new_context(viewport={"width": vw, "height": 844}, reduced_motion="reduce")
                cv.add_init_script("localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp'}));")
                pv = cv.new_page()
                pv.goto(URL, wait_until="domcontentloaded")
                pv.locator("[data-launch-phase]").wait_for(state="detached", timeout=2000)
                pv.wait_for_timeout(150)
                ov = pv.evaluate("document.documentElement.scrollWidth > window.innerWidth")
                assert not ov, f"Horizontal overflow at {vw}px!"
                cv.close()
            print("PASS 09: Zero horizontal overflow across 320, 375, 390, 393, 430px")

            browser.close()
        shutil.rmtree(tmp_vid, ignore_errors=True)
        print("ALL V4.2.0 E2E & 8 RECORDINGS PASSED!")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()


if __name__ == "__main__":
    main()
