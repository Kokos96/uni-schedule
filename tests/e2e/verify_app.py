#!/usr/bin/env python3
"""
End-to-End Playwright QA Suite for uni-schedule 2.0.

Runs against Vite preview (`npm run preview -- --host 127.0.0.1 --port 4173`),
starting and tearing down the server automatically unless `--url` is provided.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, expect, sync_playwright


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 4173
DEFAULT_URL = f"http://{DEFAULT_HOST}:{DEFAULT_PORT}"
WSL_PROJECT_DIR = "/home/kostia/projects/rozklad"

VIEWPORTS: list[tuple[int, int]] = [
    (320, 844),
    (375, 844),
    (390, 844),
    (430, 844),
    (768, 844),
    (1024, 900),
    (1280, 900),
    (1440, 900),
    (1920, 900),
]


class Diagnostics:
    def __init__(self) -> None:
        self.console_errors: list[str] = []
        self.page_errors: list[str] = []
        self.http_errors: list[str] = []

    def attach(self, page: Page) -> None:
        def on_console(msg: Any) -> None:
            if msg.type == "error":
                self.console_errors.append(f"console.error: {msg.text}")

        def on_pageerror(exc: Exception) -> None:
            self.page_errors.append(f"pageerror: {exc}")

        def on_response(resp: Any) -> None:
            if resp.status >= 400:
                self.http_errors.append(f"HTTP {resp.status} {resp.url}")

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.on("response", on_response)

    def assert_clean(self, label: str) -> None:
        problems = self.console_errors + self.page_errors + self.http_errors
        if problems:
            raise AssertionError(f"[{label}] Browser errors detected:\n  - " + "\n  - ".join(problems))


def wait_for_server(url: str, timeout_s: float = 20.0) -> None:
    deadline = time.time() + timeout_s
    last_err: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status == 200:
                    return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
        time.sleep(0.25)
    raise RuntimeError(f"Preview server at {url} did not become ready within {timeout_s}s: {last_err}")


def start_preview_server(host: str, port: int) -> subprocess.Popen[str]:
    if sys.platform == "win32":
        cmd = [
            "wsl",
            "bash",
            "-c",
            f"cd {WSL_PROJECT_DIR} && exec npm run preview -- --host {host} --port {port}",
        ]
        return subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )

    cmd = ["npm", "run", "preview", "--", "--host", host, "--port", str(port)]
    return subprocess.Popen(
        cmd,
        cwd=WSL_PROJECT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        preexec_fn=os.setsid,
    )


def stop_preview_server(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["wsl", "bash", "-c", f"pkill -f 'vite preview.*{DEFAULT_PORT}' || true"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            proc.terminate()
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=5)
    except Exception:  # noqa: BLE001
        proc.kill()


def check_horizontal_overflow(page: Page, label: str) -> str | None:
    metrics = page.evaluate(
        """() => {
            const innerWidth = window.innerWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            if (scrollWidth <= innerWidth) return { overflow: false, scrollWidth, innerWidth, offenders: [] };
            const offenders = [];
            for (const el of document.querySelectorAll('*')) {
                const r = el.getBoundingClientRect();
                if (r.right > innerWidth + 0.5 && r.width > 0 && r.height > 0) {
                    const style = getComputedStyle(el);
                    if (style.position === 'fixed') continue;
                    offenders.push({
                        tag: el.tagName.toLowerCase(),
                        cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
                        text: (el.textContent || '').trim().slice(0, 50),
                        left: Math.round(r.left),
                        right: Math.round(r.right),
                        width: Math.round(r.width),
                    });
                }
            }
            return { overflow: true, scrollWidth, innerWidth, offenders: offenders.slice(0, 6) };
        }"""
    )
    if metrics["overflow"]:
        details = "; ".join(
            f"<{o['tag']} right={o['right']} width={o['width']} class='{o['cls']}' text='{o['text']}'>"
            for o in metrics["offenders"]
        )
        return (
            f"[{label}] Horizontal overflow: scrollWidth={metrics['scrollWidth']} > "
            f"innerWidth={metrics['innerWidth']} | offenders: {details}"
        )
    return None


def test_all_viewports(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("1) Checking all 9 viewports (layout, nav visibility, overflow, zero errors)...")
    for width, height in VIEWPORTS:
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        diag = Diagnostics()
        diag.attach(page)

        try:
            page.goto(base_url, wait_until="networkidle")
            expect(page.locator("h1")).to_have_count(1)
            expect(page.locator("#main-content h2").first).to_be_visible()
            page.wait_for_timeout(200)

            ov = check_horizontal_overflow(page, f"viewport {width}x{height} tab=Розклад")
            if ov:
                failures.append(ov)
                print(f"   FAIL {ov}")

            bottom_nav = page.locator('nav[aria-label="Мобільна навігація"]')
            sidebar_nav = page.locator('aside[aria-label="Бічна навігація"]')

            if width < 1024:
                expect(bottom_nav).to_be_visible()
                expect(sidebar_nav).to_be_hidden()
            else:
                expect(sidebar_nav).to_be_visible()
                expect(bottom_nav).to_be_hidden()

            # Check all 5 tabs at mobile widths (320, 375) and desktop (1024, 1280)
            if width in (320, 375, 1024, 1280):
                nav_scope = (
                    bottom_nav
                    if width < 1024
                    else page.locator('nav[aria-label="Розділи додатку"]')
                )
                for tab_label in ("Дедлайни", "Статистика", "Довідник", "Опції", "Розклад"):
                    nav_scope.get_by_role("button", name=re.compile(tab_label)).click()
                    page.wait_for_timeout(250)
                    tab_ov = check_horizontal_overflow(page, f"viewport {width}x{height} tab={tab_label}")
                    if tab_ov:
                        failures.append(tab_ov)
                        print(f"   FAIL {tab_ov}")

            diag.assert_clean(f"viewport {width}x{height}")
            if not any(f"viewport {width}x{height}" in f for f in failures):
                print(f"   PASS viewport {width}x{height}")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"viewport {width}x{height}: {exc}")
            print(f"   FAIL viewport {width}x{height}: {exc}")
        finally:
            context.close()


def test_schedule_attendance_notes(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("2a) Checking Schedule (Day/Week + WeekGrid modal Escape), Attendance & Notes persistence...")
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    diag = Diagnostics()
    diag.attach(page)

    try:
        page.goto(base_url, wait_until="networkidle")
        sidebar = page.locator('nav[aria-label="Розділи додатку"]')

        # Week view + WeekGrid modal open/close (Escape)
        mode_group = page.get_by_role("radiogroup", name="Режим перегляду розкладу")
        mode_group.get_by_role("radio", name="Тиждень", exact=True).click()
        expect(page.locator("#main-content h2").first).to_have_text("Розклад на тиждень")

        grid_lesson_btn = page.locator("button", has_text="М'які обчислення").first
        expect(grid_lesson_btn).to_be_visible()
        grid_lesson_btn.click()

        dialog = page.locator('div[role="dialog"][aria-modal="true"]')
        expect(dialog).to_be_visible()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        print("   PASS Schedule WeekGrid cell modal open & Escape close")

        # Day view + Attendance toggle + reload persistence
        mode_group.get_by_role("radio", name="День", exact=True).click()
        week_strip_days = page.get_by_role("group", name="Дні тижня").locator("button")
        week_strip_days.nth(1).click()
        expect(page.locator("#main-content h2").first).to_have_text("Вівторок")

        first_att_group = page.get_by_role("group", name="Відмітка відвідуваності").first
        for btn_label in ("Був", "Н-ка", "Поважна"):
            btn = first_att_group.get_by_role("button", name=btn_label)
            btn.click()
            expect(btn).to_have_attribute("aria-pressed", "true")

        page.reload(wait_until="networkidle")
        mode_group = page.get_by_role("radiogroup", name="Режим перегляду розкладу")
        mode_group.get_by_role("radio", name="День", exact=True).click()
        page.get_by_role("group", name="Дні тижня").locator("button").nth(1).click()
        expect(
            page.get_by_role("group", name="Відмітка відвідуваності")
            .first.get_by_role("button", name="Поважна")
        ).to_have_attribute("aria-pressed", "true")
        print("   PASS Attendance toggle (Був/Н-ка/Поважна) + reload persistence")

        # Notes creation in LessonNotesDrawer + reload persistence
        page.locator('button[aria-label^="Нотатки до пари"]').first.click()
        notes_dialog = page.locator('div[role="dialog"][aria-modal="true"]')
        expect(notes_dialog).to_be_visible()
        notes_dialog.locator("#lesson-note-content").fill("Конспект E2E перевірки")
        notes_dialog.get_by_role("button", name="Зберегти нотатку").click()
        expect(notes_dialog.get_by_text("Конспект E2E перевірки")).to_be_visible()
        page.keyboard.press("Escape")
        expect(notes_dialog).to_have_count(0)

        page.reload(wait_until="networkidle")
        page.get_by_role("radiogroup", name="Режим перегляду розкладу").get_by_role("radio", name="День", exact=True).click()
        page.get_by_role("group", name="Дні тижня").locator("button").nth(1).click()
        page.locator('button[aria-label^="Нотатки до пари"]').first.click()
        expect(page.locator('div[role="dialog"][aria-modal="true"]').get_by_text("Конспект E2E перевірки")).to_be_visible()
        page.keyboard.press("Escape")
        expect(page.locator('div[role="dialog"][aria-modal="true"]')).to_have_count(0)
        print("   PASS LessonNotesDrawer create + reload persistence")

        # Check switching out of Schedule Day mode to another tab (repro 1)
        sidebar.get_by_role("button", name=re.compile("Дедлайни")).click()
        expect(page.locator("#main-content h2").first).to_have_text("Дедлайни та завдання")
        print("   PASS Tab switch from Schedule Day mode -> Deadlines")

        diag.assert_clean("schedule/attendance/notes")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"schedule/attendance/notes: {exc}")
        print(f"   FAIL schedule/attendance/notes: {exc}")
    finally:
        context.close()


def test_deadlines_flow(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("2b) Checking Deadlines create, toggle complete, delete + persistence...")
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    diag = Diagnostics()
    diag.attach(page)

    try:
        page.goto(base_url, wait_until="networkidle")
        sidebar = page.locator('nav[aria-label="Розділи додатку"]')

        sidebar.get_by_role("button", name=re.compile("Дедлайни")).click()
        expect(page.locator("#main-content h2").first).to_have_text("Дедлайни та завдання")

        page.get_by_role("button", name="Додати дедлайн").click()
        dl_dialog = page.locator('div[role="dialog"][aria-modal="true"]')
        expect(dl_dialog).to_be_visible()
        dl_dialog.locator("#deadline-title").fill("Лабораторна E2E №1")
        dl_dialog.get_by_role("button", name="Створити").click()
        expect(dl_dialog).to_have_count(0)
        expect(page.get_by_text("Лабораторна E2E №1")).to_be_visible()

        page.locator('button[role="checkbox"][aria-label*="Лабораторна E2E №1"]').click()
        filter_group = page.get_by_role("radiogroup", name="Фільтр дедлайнів")
        filter_group.get_by_role("radio", name=re.compile("Виконані")).click()
        expect(page.get_by_text("Лабораторна E2E №1")).to_be_visible()

        page.reload(wait_until="networkidle")
        sidebar.get_by_role("button", name=re.compile("Дедлайни")).click()
        page.get_by_role("radiogroup", name="Фільтр дедлайнів").get_by_role("radio", name=re.compile("Виконані")).click()
        expect(page.get_by_text("Лабораторна E2E №1")).to_be_visible()

        page.locator('button[aria-label*="Видалити «Лабораторна E2E №1»"]').click()
        page.get_by_role("button", name="Видалити", exact=True).click()
        expect(page.get_by_text("Лабораторна E2E №1")).to_have_count(0)

        page.reload(wait_until="networkidle")
        sidebar.get_by_role("button", name=re.compile("Дедлайни")).click()
        page.get_by_role("radiogroup", name="Фільтр дедлайнів").get_by_role("radio", name=re.compile("Усі")).click()
        expect(page.get_by_text("Лабораторна E2E №1")).to_have_count(0)
        print("   PASS Deadlines create, toggle complete, delete + reload persistence")

        # Also check switching out of Deadlines after using filter SegmentedControl (repro 2)
        sidebar.get_by_role("button", name=re.compile("Довідник")).click()
        expect(page.locator("#main-content h2").first).to_have_text("Довідник")
        print("   PASS Tab switch from Deadlines (after filter switch) -> Directory")

        diag.assert_clean("deadlines flow")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"deadlines flow: {exc}")
        print(f"   FAIL deadlines flow: {exc}")
    finally:
        context.close()


def test_directory_flow(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("2c) Checking Directory (Teachers/Classrooms switch + search filter)...")
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    diag = Diagnostics()
    diag.attach(page)

    try:
        page.goto(base_url, wait_until="networkidle")
        sidebar = page.locator('nav[aria-label="Розділи додатку"]')

        sidebar.get_by_role("button", name=re.compile("Довідник")).click()
        expect(page.locator("#main-content h2").first).to_have_text("Довідник")
        teachers_search = page.locator('input[aria-label="Пошук викладачів"]')
        teachers_search.fill("Демків")
        expect(page.get_by_text("Демків").first).to_be_visible()
        expect(page.get_by_text("Шот")).to_have_count(0)

        page.get_by_role("radiogroup", name="Розділ довідника").get_by_role("radio", name="Аудиторії").click()
        rooms_search = page.locator('input[aria-label="Пошук аудиторій"]')
        rooms_search.fill("130")
        expect(page.get_by_text("130").first).to_be_visible()

        # Repro 3: switching out of Directory after section switch -> Schedule
        sidebar.get_by_role("button", name=re.compile("Розклад")).click()
        expect(page.locator("#main-content h2").first).to_have_text("Розклад на тиждень")
        print("   PASS Directory Teachers/Classrooms switch + search filter + tab switch -> Schedule")

        diag.assert_clean("directory flow")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"directory flow: {exc}")
        print(f"   FAIL directory flow: {exc}")
    finally:
        context.close()


def test_stats_flow(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("2d) Checking Stats (attendance % update + goal calculator)...")
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    diag = Diagnostics()
    diag.attach(page)

    try:
        page.goto(base_url, wait_until="networkidle")
        sidebar = page.locator('nav[aria-label="Розділи додатку"]')

        # Desktop defaults to Week mode; mark first lesson via WeekGrid modal
        page.locator("button", has_text="М'які обчислення").first.click()
        cell_modal = page.locator('div[role="dialog"][aria-modal="true"]')
        cell_modal.get_by_role("button", name="Поважна").click()
        page.keyboard.press("Escape")
        expect(cell_modal).to_have_count(0)

        sidebar.get_by_role("button", name=re.compile("Статистика")).click()
        page.get_by_role("radiogroup", name="Період аналітики відвідуваності").get_by_role("radio", name="Весь семестр").click()
        expect(page.get_by_text("Відмічено 1 пар (1 зараховано)")).to_be_visible()

        # Reload back to Schedule Week mode (avoids PageTransition SegmentedControl deadlock), mark second lesson absent
        page.reload(wait_until="networkidle")
        page.locator("button", has_text="Професійний Python").first.click()
        cell_modal = page.locator('div[role="dialog"][aria-modal="true"]')
        cell_modal.get_by_role("button", name="Н-ка").click()
        page.keyboard.press("Escape")
        expect(cell_modal).to_have_count(0)

        sidebar.get_by_role("button", name=re.compile("Статистика")).click()
        page.get_by_role("radiogroup", name="Період аналітики відвідуваності").get_by_role("radio", name="Весь семестр").click()
        expect(page.get_by_text("Відмічено 2 пар (1 зараховано)")).to_be_visible()
        expect(page.locator('svg[role="img"][aria-label*="Відвідуваність 50%"]')).to_be_visible()

        goal_presets = page.get_by_role("group", name="Швидкий вибір цілі відвідуваності")
        goal_presets.get_by_role("button", name="90%").click()
        expect(page.get_by_text("Ціль: 90%")).to_be_visible()
        expect(page.get_by_text(re.compile(r"Потрібно відвідати \d+ пар"))).to_be_visible()

        slider = page.locator('input[type="range"]').first
        slider.fill("100")
        expect(page.get_by_text("Поріг 100% уже недосяжний")).to_be_visible()
        print("   PASS Stats attendance % update + goal calculator updates")

        diag.assert_clean("stats flow")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"stats flow: {exc}")
        print(f"   FAIL stats flow: {exc}")
    finally:
        context.close()


def test_settings_and_backup_flow(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("2e) Checking Settings (theme, department/subgroup) & JSON Export/Import...")
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        accept_downloads=True,
        permissions=["clipboard-read", "clipboard-write"],
    )
    page = context.new_page()
    diag = Diagnostics()
    diag.attach(page)

    try:
        page.goto(base_url, wait_until="networkidle")
        sidebar = page.locator('nav[aria-label="Розділи додатку"]')

        # Mark 1 attendance record so exported JSON has non-empty attendance
        page.locator("button", has_text="М'які обчислення").first.click()
        cell_modal = page.locator('div[role="dialog"][aria-modal="true"]')
        cell_modal.get_by_role("button", name="Був").click()
        page.keyboard.press("Escape")
        expect(cell_modal).to_have_count(0)

        # --- Settings tab: Theme switch + Department/Subgroup switch + keyboard focus-visible ---
        sidebar.get_by_role("button", name=re.compile("Опції")).click()
        theme_group = page.get_by_role("radiogroup", name="Тема інтерфейсу")
        light_radio = theme_group.get_by_role("radio", name="Світла", exact=True)
        light_radio.click()
        expect(page.locator("html")).to_have_attribute("data-theme", "light")
        # Keyboard ArrowRight/ArrowLeft inside SegmentedControl:
        # options order is [Темна, Світла, Системна]
        light_radio.focus()
        page.keyboard.press("ArrowRight")
        system_radio = theme_group.get_by_role("radio", name="Системна", exact=True)
        expect(system_radio).to_have_attribute("aria-checked", "true")
        page.keyboard.press("ArrowLeft")
        expect(light_radio).to_have_attribute("aria-checked", "true")
        page.keyboard.press("ArrowLeft")
        expect(page.locator("html")).to_have_attribute("data-theme", "dark")
        dark_radio = theme_group.get_by_role("radio", name="Темна", exact=True)
        expect(dark_radio).to_have_attribute("aria-checked", "true")
        # Tab focus-visible check (outline or box-shadow present when keyboard focused)
        page.keyboard.press("Tab")
        focus_styles = page.evaluate(
            """() => {
                const el = document.activeElement;
                if (!el) return null;
                const s = getComputedStyle(el);
                return { tag: el.tagName, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow };
            }"""
        )
        assert focus_styles is not None and (
            (focus_styles["outlineStyle"] != "none" and focus_styles["outlineWidth"] != "0px")
            or focus_styles["boxShadow"] != "none"
        ), f"Missing visible focus ring on keyboard Tab: {focus_styles}"

        page.get_by_role("radiogroup", name="Вибір кафедри").get_by_role("radio", name=re.compile("РКС")).click()
        page.get_by_role("radiogroup", name="Підгрупа для лабораторних").get_by_role("radio", name="2-га підгрупа").click()

        # --- JSON Export & Import (valid + invalid JSON error alert) ---
        with page.expect_download() as download_info:
            page.get_by_role("button", name="Завантажити JSON").click()
        download = download_info.value
        if not download.suggested_filename.startswith("uni-schedule-backup-"):
            raise AssertionError(f"Unexpected backup filename: {download.suggested_filename}")

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        download.save_as(str(tmp_path))
        exported_text = tmp_path.read_text(encoding="utf-8")
        exported_json = json.loads(exported_text)
        tmp_path.unlink(missing_ok=True)
        assert exported_json["schemaVersion"] == 2
        assert len(exported_json["data"]["attendance"]) >= 1

        page.get_by_role("button", name="Копіювати JSON").click()
        expect(page.get_by_text("JSON скопійовано", exact=False)).to_be_visible()

        page.get_by_role("button", name="Вставити JSON").click()
        paste_box = page.locator('textarea[placeholder*="schemaVersion"]')
        paste_box.fill("{invalid-json")
        page.get_by_role("button", name="Перевірити JSON").click()
        alert = page.locator('div[role="alert"]').first
        expect(alert).to_be_visible()
        expect(alert).to_contain_text("JSON")

        paste_box.fill(exported_text)
        page.get_by_role("button", name="Перевірити JSON").click()
        import_dialog = page.locator('div[role="dialog"][aria-modal="true"]')
        expect(import_dialog).to_be_visible()
        expect(import_dialog.get_by_text("JSON валідний")).to_be_visible()
        import_dialog.get_by_role("button", name=re.compile("Об'єднати")).click()
        expect(import_dialog).to_have_count(0)
        print("   PASS Settings theme + JSON Export (download + copy) & JSON Import (invalid alert + valid merge)")

        # Verify persisted department/subgroup schedule update after reload
        page.reload(wait_until="networkidle")
        expect(page.get_by_text("Вибрані розділи мови програмування C").first).to_be_visible()
        print("   PASS Settings department/subgroup schedule update persisted")

        diag.assert_clean("settings/backup flow")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"settings/backup flow: {exc}")
        print(f"   FAIL settings/backup flow: {exc}")
    finally:
        context.close()


def test_pwa_and_reduced_motion(browser: Browser, base_url: str, failures: list[str]) -> None:
    print("3) Checking PWA assets (/manifest.json, icons, Service Worker, /offline.html) & reduced-motion...")
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    diag = Diagnostics()
    diag.attach(page)

    try:
        page.goto(base_url, wait_until="networkidle")

        manifest_res = page.request.get(f"{base_url}/manifest.json")
        assert manifest_res.status == 200, f"manifest.json returned {manifest_res.status}"
        manifest = manifest_res.json()
        icons = manifest.get("icons", [])
        assert len(icons) >= 1, "manifest.json has no icons"

        for icon in icons:
            src = icon["src"]
            icon_url = src if src.startswith("http") else f"{base_url}{src}"
            icon_res = page.request.get(icon_url)
            assert icon_res.status == 200, f"Icon {icon_url} returned {icon_res.status}"

        sw_state = page.evaluate(
            """async () => {
                if (!('serviceWorker' in navigator)) return { supported: false };
                const reg = await navigator.serviceWorker.ready;
                const activeUrl = reg.active ? reg.active.scriptURL : null;
                return { supported: true, activeUrl, scope: reg.scope };
            }"""
        )
        assert sw_state["supported"] is True, "navigator.serviceWorker not supported"
        assert sw_state["activeUrl"] and sw_state["activeUrl"].endswith("/sw.js"), (
            f"Unexpected SW scriptURL: {sw_state}"
        )

        offline_res = page.goto(f"{base_url}/offline.html", wait_until="domcontentloaded")
        assert offline_res is not None and offline_res.status == 200
        expect(page.locator("body")).not_to_be_empty()

        page.emulate_media(reduced_motion="reduce")
        page.goto(base_url, wait_until="networkidle")
        expect(page.locator("h1")).to_have_count(1)
        expect(page.locator("#main-content h2").first).to_be_visible()
        sidebar = page.locator('nav[aria-label="Розділи додатку"]')
        sidebar.get_by_role("button", name=re.compile("Статистика")).click()
        expect(page.locator("#main-content h2", has_text="Відвідуваність")).to_be_visible()

        diag.assert_clean("PWA & reduced-motion")
        print("   PASS PWA (manifest.json, icons 200 OK, sw.js registered, offline.html) & reduced-motion")
    except Exception as exc:  # noqa: BLE001
        failures.append(f"PWA & reduced-motion: {exc}")
        print(f"   FAIL PWA & reduced-motion: {exc}")
    finally:
        context.close()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Run uni-schedule 2.0 Playwright E2E suite")
    parser.add_argument("--url", default=None, help="Existing running preview URL (skip launching server)")
    args = parser.parse_args()

    base_url = args.url or DEFAULT_URL
    server_proc: subprocess.Popen[str] | None = None
    failures: list[str] = []

    try:
        if args.url is None:
            print(f"Starting Vite preview server at {base_url}...")
            server_proc = start_preview_server(DEFAULT_HOST, DEFAULT_PORT)
            wait_for_server(base_url, timeout_s=25.0)

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                test_all_viewports(browser, base_url, failures)
                test_schedule_attendance_notes(browser, base_url, failures)
                test_deadlines_flow(browser, base_url, failures)
                test_directory_flow(browser, base_url, failures)
                test_stats_flow(browser, base_url, failures)
                test_settings_and_backup_flow(browser, base_url, failures)
                test_pwa_and_reduced_motion(browser, base_url, failures)
            finally:
                browser.close()

        if failures:
            print(f"\nE2E SUITE FINISHED WITH {len(failures)} FAILURE(S):")
            for idx, err in enumerate(failures, 1):
                print(f"  {idx}. {err}")
            return 1

        print("\nALL E2E CHECKS PASSED!")
        return 0
    finally:
        stop_preview_server(server_proc)


if __name__ == "__main__":
    sys.exit(main())
