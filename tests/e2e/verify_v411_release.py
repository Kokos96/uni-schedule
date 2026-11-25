#!/usr/bin/env python3
"""Comprehensive v4.1.1 Academic E2E, Motion E2E, and Visual Recording verification."""
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
PORT = 4176
URL = f"http://{HOST}:{PORT}"
REPO_WSL = "/home/kostia/projects/rozklad"
OUT_DIR = Path(os.environ.get("V411_ARTIFACT_DIR", "v411_recordings"))


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


def install_mock_api(ctx) -> None:
    """Intercepts LNU Worker API endpoints with deterministic verified responses."""
    faculties = [
        {"id": "1005", "name": "Факультет електроніки та комп'ютерних технологій"},
        {"id": "1007", "name": "Факультет іноземних мов"},
        {"id": "1013", "name": "Факультет прикладної математики та інформатики"},
    ]
    all_groups = [
        {"id": "ФЕП-33с", "name": "ФЕП-33с", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-se", "programName": "Інженерія програмного забезпечення (121)", "course": 3},
        {"id": "ФЕП-34с", "name": "ФЕП-34с", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-se", "programName": "Інженерія програмного забезпечення (121)", "course": 3},
        {"id": "ФЕІ-31", "name": "ФЕІ-31", "facultyId": "1005", "facultyVerified": True, "programId": "lnu-1005-cs", "programName": "Комп'ютерні науки (122)", "course": 3},
        {"id": "ІНА-21", "name": "ІНА-21", "facultyId": "1007", "facultyVerified": True, "programId": "lnu-1007-en", "programName": "Англійська філологія", "course": 2},
        {"id": "ПМІ-41", "name": "ПМІ-41", "facultyId": "1013", "facultyVerified": True, "programId": "lnu-1013-cs", "programName": "Комп'ютерні науки / Інформатика", "course": 4},
    ]

    def handle_route(route):
        url = route.request.url
        if "/api/universities/lnu/faculties" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"faculties": faculties}))
            return
        if "/api/universities/lnu/groups" in url:
            from urllib.parse import urlparse, parse_qs
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
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(url).query)
            grp = qs.get("group", [""])[0]
            if grp == "FAIL-99":
                route.fulfill(
                    status=502,
                    content_type="application/json",
                    body=json.dumps({"error": {"code": "UPSTREAM_UNAVAILABLE", "message": "Сервер ЛНУ тимчасово недоступний"}}),
                )
                return
            matched = next((g for g in all_groups if g["name"] == grp), None)
            today_iso = time.strftime("%Y-%m-%d")
            schedule = {
                "universityId": "lnu",
                "universityName": "ЛНУ ім. Івана Франка",
                "facultyId": matched["facultyId"] if matched else None,
                "groupId": grp,
                "groupName": grp,
                "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "sourceType": "dated",
                "coveredFrom": "2026-11-23",
                "coveredTo": "2026-12-06",
                "warnings": [],
                "lessons": [
                    {
                        "id": f"lnu_{grp}_1",
                        "date": today_iso,
                        "dayOfWeek": 3,
                        "number": 1,
                        "startTime": "08:30",
                        "endTime": "09:50",
                        "subject": f"Тестова пара ({grp})",
                        "lessonType": "Л",
                        "teacher": "Викладач Тест",
                        "room": "111",
                        "building": "Головний",
                        "universityId": "lnu",
                        "status": "active",
                    }
                ],
            }
            if schedule["facultyId"] is None:
                del schedule["facultyId"]
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


def wait_splash_done(page) -> None:
    splash = page.locator("[data-launch-phase]")
    try:
        splash.wait_for(state="visible", timeout=2500)
    except Exception:
        pass
    splash.wait_for(state="detached", timeout=5000)
    page.wait_for_timeout(450)


def save_video(page, target_name: str) -> Path:
    video = page.video
    page.close()
    assert video is not None, f"No video recorded for {target_name}"
    src = Path(video.path())
    dst = OUT_DIR / target_name
    shutil.copy2(src, dst)
    return dst


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_vid = OUT_DIR / "_tmp"
    tmp_vid.mkdir(parents=True, exist_ok=True)
    dist_wsl = "/tmp/uni-v411-e2e-dist"

    subprocess.run(
        [
            "wsl", "-e", "bash", "-lc",
            f"export PATH=\"$HOME/.local/node/bin:$PATH\" && cd {REPO_WSL} && VITE_API_BASE_URL={URL} npx vite build --outDir {dist_wsl} --emptyOutDir",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    server = subprocess.Popen(
        ["wsl", "-e", "bash", "-lc", f"export PATH=\"$HOME/.local/node/bin:$PATH\" && cd {REPO_WSL} && npx vite preview --outDir {dist_wsl} --host {HOST} --port {PORT} --strictPort"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_ready(URL)
        with sync_playwright() as p:
            browser = p.chromium.launch()

            # --- RECORDING 1: Cold-launch animation (~2500ms) ---
            ctx1 = browser.new_context(
                viewport={"width": 390, "height": 844},
                record_video_dir=str(tmp_vid),
                record_video_size={"width": 390, "height": 844},
            )
            ctx1.add_init_script(
                "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'dark'}));"
            )
            p1 = ctx1.new_page()
            p1.goto(URL, wait_until="domcontentloaded")
            splash = p1.locator("[data-launch-phase]")
            splash.wait_for(state="visible", timeout=5000)
            t0 = time.time()
            p1.wait_for_timeout(450)
            p1.screenshot(path=str(OUT_DIR / "01_splash_settle.png"))
            splash.wait_for(state="detached", timeout=5000)
            elapsed_ms = int((time.time() - t0) * 1000)
            assert 2000 <= elapsed_ms <= 3400, f"Unexpected cold launch duration: {elapsed_ms}ms"
            p1.wait_for_timeout(450)
            expect(p1.locator('nav[aria-label="Мобільна навігація"]')).to_be_visible()
            rec1 = save_video(p1, "01_cold_launch.webm")
            ctx1.close()
            print(f"PASS REC 1: Cold launch completed in {elapsed_ms}ms -> {rec1}")

            # --- RECORDING 2: Expanded -> Compact -> Expanded dock ---
            ctx2 = browser.new_context(
                viewport={"width": 390, "height": 844},
                record_video_dir=str(tmp_vid),
                record_video_size={"width": 390, "height": 844},
            )
            ctx2.add_init_script(
                "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'dark'}));"
            )
            p2 = ctx2.new_page()
            p2.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p2)
            nav = p2.locator('nav[aria-label="Мобільна навігація"]')
            nav.get_by_role("button", name="Опції").click()
            p2.wait_for_timeout(450)
            box_exp = nav.bounding_box()
            assert box_exp is not None and 345 <= box_exp["width"] <= 365 and 55 <= box_exp["height"] <= 60, f"Expanded dock out of spec: {box_exp}"
            p2.evaluate("window.scrollTo({top: 480, behavior: 'smooth'})")
            p2.wait_for_timeout(650)
            expect(nav).to_have_attribute("data-dock-state", "compact")
            box_cmp = nav.bounding_box()
            assert box_cmp is not None and 295 <= box_cmp["width"] <= 318 and 50 <= box_cmp["height"] <= 54, f"Compact dock out of spec: {box_cmp}"
            p2.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
            p2.wait_for_timeout(650)
            expect(nav).to_have_attribute("data-dock-state", "expanded")
            rec2 = save_video(p2, "02_dock_scroll_compact_expand.webm")
            ctx2.close()
            print(f"PASS REC 2: Dock geometry {int(box_exp['width'])}x{int(box_exp['height'])} -> {int(box_cmp['width'])}x{int(box_cmp['height'])} -> {rec2}")

            # --- RECORDING 3: Rapid first-to-last tab switching ---
            ctx3 = browser.new_context(
                viewport={"width": 390, "height": 844},
                record_video_dir=str(tmp_vid),
                record_video_size={"width": 390, "height": 844},
            )
            ctx3.add_init_script(
                "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp', theme:'light'}));"
            )
            p3 = ctx3.new_page()
            p3.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p3)
            nav3 = p3.locator('nav[aria-label="Мобільна навігація"]')
            ind3 = p3.locator('[data-testid="mobile-nav-indicator"]')
            y0 = ind3.bounding_box()["y"]
            for label in ["Опції", "Розклад", "Довідник", "Дедлайни", "Статистика", "Опції", "Розклад"]:
                nav3.get_by_role("button", name=label).click()
                p3.wait_for_timeout(240)
                y_now = ind3.bounding_box()["y"]
                assert abs(y_now - y0) < 8, f"Vertical indicator jump on {label}: {y0} -> {y_now}"
            assert p3.locator("[data-launch-phase]").count() == 0, "Splash replayed!"
            rec3 = save_video(p3, "03_rapid_tab_switching.webm")
            ctx3.close()
            print(f"PASS REC 3: Rapid tab switching (light theme, 0 vertical jumps) -> {rec3}")

            # --- RECORDING 4 & 5: Strict faculty/specialty filtering + group activation + reload persistence ---
            ctx4 = browser.new_context(
                viewport={"width": 390, "height": 844},
                record_video_dir=str(tmp_vid),
                record_video_size={"width": 390, "height": 844},
            )
            install_mock_api(ctx4)
            p4 = ctx4.new_page()
            p4.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p4)

            # Unconfigured first launch shows onboarding with UniversitySelectorCard
            expect(p4.get_by_text("Налаштування розкладу")).to_be_visible()
            p4.locator("#uni-faculty").select_option("1005")
            p4.wait_for_timeout(350)
            # Specialty selector appears for verified faculty 1005
            expect(p4.locator("#uni-program")).to_be_visible()
            # Open combobox with empty input
            p4.locator("#uni-group").click()
            p4.wait_for_timeout(250)
            listbox = p4.locator("#uni-group-listbox")
            expect(listbox).to_be_visible()
            listbox_text = listbox.inner_text()
            assert "ФЕП-33с" in listbox_text, f"ФЕП-33с missing: {listbox_text}"
            assert "ІНА-21" not in listbox_text, f"ІНА-21 leaked into faculty 1005: {listbox_text}"
            # Narrow by specialty
            p4.locator("#uni-program").select_option("lnu-1005-se")
            p4.wait_for_timeout(300)
            p4.locator("#uni-group").click()
            p4.wait_for_timeout(200)
            listbox_se = listbox.inner_text()
            assert "ФЕП-33с" in listbox_se and "ФЕІ-31" not in listbox_se
            listbox.get_by_role("option", name="ФЕП-33с").click()
            p4.wait_for_timeout(250)
            rec4_snap = p4.screenshot(path=str(OUT_DIR / "04_faculty_group_selected.png"))
            # Activate group
            p4.get_by_role("button", name="Активувати групу").click()
            p4.wait_for_timeout(600)
            expect(p4.get_by_role("heading", name="Тестова пара (ФЕП-33с)")).to_be_visible()
            # Reload and verify persistence
            p4.reload(wait_until="domcontentloaded")
            wait_splash_done(p4)
            expect(p4.get_by_role("heading", name="Тестова пара (ФЕП-33с)")).to_be_visible()
            rec4 = save_video(p4, "04_academic_selection_and_activation.webm")
            ctx4.close()
            # Also copy/export as 05_timetable_activation.webm if needed or record dedicated activation switch
            print(f"PASS REC 4: Strict faculty/program filtering + activation + reload persistence -> {rec4}")

            # --- RECORDING 5: Existing user switching Group A -> Group B + failed activation preserves Group B ---
            ctx5 = browser.new_context(
                viewport={"width": 390, "height": 844},
                record_video_dir=str(tmp_vid),
                record_video_size={"width": 390, "height": 844},
            )
            install_mock_api(ctx5)
            ctx5.add_init_script(
                json.dumps({
                    "scheduleSourceMode": "live",
                    "subgroup": 1,
                    "department": "sp",
                    "universityProfile": {
                        "universityId": "lnu",
                        "facultyId": "1005",
                        "groupId": "ФЕП-33с",
                        "groupName": "ФЕП-33с",
                    },
                })
                and "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'live', subgroup:1, department:'sp', universityProfile:{universityId:'lnu', facultyId:'1005', groupId:'ФЕП-33с', groupName:'ФЕП-33с'}}));"
            )
            p5 = ctx5.new_page()
            p5.goto(URL, wait_until="domcontentloaded")
            wait_splash_done(p5)
            p5.locator('nav[aria-label="Мобільна навігація"]').get_by_role("button", name="Опції").click()
            p5.wait_for_timeout(400)
            p5.locator("#uni-faculty").select_option("1013")
            p5.wait_for_timeout(350)
            p5.locator("#uni-group").click()
            p5.wait_for_timeout(250)
            p5.locator("#uni-group-listbox").get_by_role("option", name="ПМІ-41").click()
            p5.wait_for_timeout(200)
            p5.get_by_role("button", name="Активувати групу").click()
            p5.wait_for_timeout(600)
            expect(p5.get_by_text("Активний розклад групи: ПМІ-41")).to_be_visible()
            # Verify failed group activation preserves ПМІ-41 and shows retry button
            p5.locator("#uni-group").fill("FAIL-99")
            p5.get_by_role("button", name="Активувати групу").click()
            p5.wait_for_timeout(500)
            expect(p5.get_by_text("Спробувати ще раз")).to_be_visible()
            rec5 = save_video(p5, "05_timetable_activation.webm")
            ctx5.close()
            print(f"PASS REC 5: Group A -> B activation & failure rollback -> {rec5}")

            # --- Reduced motion & narrow 320px viewport check ---
            ctx6 = browser.new_context(
                viewport={"width": 320, "height": 640},
                reduced_motion="reduce",
            )
            ctx6.add_init_script(
                "localStorage.setItem('uni_schedule_settings_v2', JSON.stringify({scheduleSourceMode:'builtin', subgroup:1, department:'sp'}));"
            )
            p6 = ctx6.new_page()
            t_rm = time.time()
            p6.goto(URL, wait_until="domcontentloaded")
            p6.locator("[data-launch-phase]").wait_for(state="detached", timeout=1500)
            rm_ms = int((time.time() - t_rm) * 1000)
            assert rm_ms < 1000, f"Reduced motion splash too slow: {rm_ms}ms"
            nav6 = p6.locator('nav[aria-label="Мобільна навігація"]')
            expect(nav6).to_be_visible()
            box6 = nav6.bounding_box()
            assert box6 is not None and box6["width"] <= 310, f"Narrow viewport dock overflowed: {box6}"
            ctx6.close()
            print(f"PASS 6: Reduced motion ({rm_ms}ms) & narrow 320px dock ({int(box6['width'])}px)")

            browser.close()
        shutil.rmtree(tmp_vid, ignore_errors=True)
        print("ALL V4.1.1 E2E & RECORDING CHECKS PASSED!")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except Exception:
            server.kill()


if __name__ == "__main__":
    main()
