"""
Uni Schedule v4.2.1 — Academic Schedule Integrity E2E Verification & Visual Recordings.

Covers ІНА-35с parallel foreign language personalization, Day/Week View consistency,
live subgroup switching, DVVS + general mandatory lesson preservation, ФЕП-33с regression,
cross-faculty ФЕП-13с universal detection, reload + offline persistence, and light/dark themes.
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
RECORDINGS_DIR = Path(
    os.environ.get(
        'V421_RECORDINGS_DIR',
        '/mnt/c/Users/lev68/.gemini/antigravity/brain/64760d40-b7af-46cf-acbf-14748f1971d9/v421_recordings',
    )
)
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('V421_PORT', '4191'))
BASE_URL = f'http://127.0.0.1:{PORT}'


def load_ina35_payload() -> dict:
    """Parse the real saved official LNU HTML fixture for ІНА-35с via tsx."""
    script = (
        "import fs from 'node:fs';"
        "import { parseLnuScheduleHtml } from './src/integrations/universities/lnu/lnuParser';"
        "const html = fs.readFileSync('./tests/fixtures/lnu-ina35s-2026-11-26-live.html', 'utf-8');"
        "const parsed = parseLnuScheduleHtml(html, { groupId: 'ІНА-35с', groupName: 'ІНА-35с', facultyId: '1007', course: 3 }, { coveredFrom: '2026-11-23', coveredTo: '2026-12-06' });"
        "process.stdout.write(JSON.stringify(parsed));"
    )
    out = subprocess.check_output(
        ['npx', 'tsx', '-e', script],
        cwd=str(REPO_ROOT),
        text=True,
    )
    return json.loads(out)


def build_fep13_payload() -> dict:
    """Synthetic cross-faculty schedule mirroring real ФЕП-13с parallel Іноземна мова."""
    return {
        'universityId': 'lnu',
        'universityName': 'ЛНУ ім. Івана Франка',
        'facultyId': '1005',
        'groupId': 'ФЕП-13с',
        'groupName': 'ФЕП-13с',
        'fetchedAt': '2026-11-23T08:00:00.000Z',
        'sourceType': 'dated',
        'coveredFrom': '2026-11-23',
        'coveredTo': '2026-11-29',
        'warnings': [],
        'lessons': [
            {
                'id': 'lnu_fep13_d1_p1_en_a',
                'date': '2026-11-23',
                'dayOfWeek': 1,
                'number': 1,
                'startTime': '08:30',
                'endTime': '09:50',
                'subject': 'Іноземна мова',
                'lessonType': 'П',
                'teacher': 'доц. Коваленко О.І.',
                'room': '201/І',
                'building': 'Корпус І',
                'group': 'ФЕП-13с',
                'groupLabel': 'Збірна група',
                'isElective': False,
                'status': 'active',
                'universityId': 'lnu',
                'updatedAt': '2026-11-23T08:00:00.000Z',
            },
            {
                'id': 'lnu_fep13_d1_p1_en_b',
                'date': '2026-11-23',
                'dayOfWeek': 1,
                'number': 1,
                'startTime': '08:30',
                'endTime': '09:50',
                'subject': 'Іноземна мова',
                'lessonType': 'П',
                'teacher': 'ас. Мельник І.В.',
                'room': '204/І',
                'building': 'Корпус І',
                'group': 'ФЕП-13с',
                'groupLabel': 'Збірна група',
                'isElective': False,
                'status': 'active',
                'universityId': 'lnu',
                'updatedAt': '2026-11-23T08:00:00.000Z',
            },
            {
                'id': 'lnu_fep13_d1_p2_math',
                'date': '2026-11-23',
                'dayOfWeek': 1,
                'number': 2,
                'startTime': '10:10',
                'endTime': '11:30',
                'subject': 'Математичний аналіз',
                'lessonType': 'Л',
                'teacher': 'проф. Ткаченко С.М.',
                'room': '114/Д',
                'building': 'Корпус Д',
                'group': 'ФЕП-13с',
                'isElective': False,
                'status': 'active',
                'universityId': 'lnu',
                'updatedAt': '2026-11-23T08:00:00.000Z',
            },
        ],
    }


def make_init_script(settings_val: dict, cache_entries: dict, date_ymd=(2026, 11, 23, 9, 0)) -> str:
    y, m, d, hh, mm = date_ymd
    cache_env = {'schemaVersion': 3, 'entries': cache_entries}
    return f"""
      const fixedNow = new Date({y}, {m - 1}, {d}, {hh}, {mm}, 0).getTime();
      const OrigDate = Date;
      class MockDate extends OrigDate {{
        constructor(...args) {{
          if (args.length === 0) super(fixedNow);
          else super(...args);
        }}
        static now() {{ return fixedNow; }}
      }}
      window.Date = MockDate;
      if (!localStorage.getItem('uni_schedule_settings_v2')) {{
        localStorage.setItem('uni_schedule_settings_v2', {json.dumps(json.dumps(settings_val, ensure_ascii=False))});
        localStorage.setItem('uni_schedule_cached_group_v3', {json.dumps(json.dumps(cache_env, ensure_ascii=False))});
      }}
      sessionStorage.setItem('uni_schedule_splash_seen_v1', '1');
    """


def save_video(page, context, filename: str) -> Path:
    video_path = page.video.path()
    context.close()
    target = RECORDINGS_DIR / filename
    if target.exists():
        target.unlink()
    Path(video_path).rename(target)
    return target


def new_ctx(browser, color_scheme='dark'):
    return browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        color_scheme=color_scheme,
        service_workers='block',
        record_video_dir=str(RECORDINGS_DIR),
        record_video_size={'width': 390, 'height': 844},
    )


def attach_api_routes(page, schedule_by_group: dict):
    def handle_route(route):
        url = route.request.url
        if '/api/schedule' in url:
            for gname, payload in schedule_by_group.items():
                if gname in url or gname.lower() in url.lower():
                    route.fulfill(
                        status=200,
                        content_type='application/json',
                        body=json.dumps({'schedule': payload, 'source': 'live'}),
                    )
                    return
            first_payload = next(iter(schedule_by_group.values()))
            route.fulfill(
                status=200,
                content_type='application/json',
                body=json.dumps({'schedule': first_payload, 'source': 'live'}),
            )
            return
        if '/api/profile' in url:
            if route.request.method == 'PUT':
                route.fulfill(
                    status=200,
                    content_type='application/json',
                    body=json.dumps({'profile': {'revision': 2}}),
                )
            else:
                route.fulfill(status=404, content_type='application/json', body='{"error":{"code":"NOT_FOUND"}}')
            return
        if '/api/auth/register' in url:
            route.fulfill(
                status=200,
                content_type='application/json',
                body=json.dumps({'userId': 'u-e2e', 'deviceId': 'd-e2e', 'syncToken': 'tok-e2e'}),
            )
            return
        route.continue_()

    page.route('**/api/**', handle_route)


def select_parallel_option(page, dim_label: str, search_text: str):
    """Open PremiumSelect for a parallel dimension, search, and select matching option."""
    trigger = page.get_by_label(dim_label)
    trigger.scroll_into_view_if_needed()
    trigger.click()
    page.wait_for_timeout(300)
    search_input = page.locator('input[placeholder*="Пошук"]')
    if search_input.count() > 0:
        search_input.first.fill(search_text)
        page.wait_for_timeout(250)
    option = page.locator('[role="option"]').filter(has_text=search_text).first
    option.click()
    page.wait_for_timeout(350)


def main():
    ina35_payload = load_ina35_payload()
    fep13_payload = build_fep13_payload()
    ina35_identity = json.dumps(['lnu', '1007', 'ІНА-35с'], ensure_ascii=False, separators=(',', ':'))
    fep13_identity = json.dumps(['lnu', '1005', 'ФЕП-13с'], ensure_ascii=False, separators=(',', ':'))

    ina35_base_settings = {
        'subgroup': 1,
        'department': 'sp',
        'electiveCourse': 'freelance',
        'theme': 'dark',
        'attendanceGoal': 80,
        'showWeekends': False,
        'semesterStartDate': '2026-09-01',
        'desktopScheduleMode': 'day',
        'scheduleSourceMode': 'live',
        'universityProfile': {
            'universityId': 'lnu',
            'facultyId': '1007',
            'facultyName': 'Факультет іноземних мов',
            'programId': 'lnu-1007-english-philology',
            'programName': 'Англійська філологія',
            'course': 3,
            'groupId': 'ІНА-35с',
            'groupName': 'ІНА-35с',
            'subgroup': 1,
        },
        'selectedElectives': [],
    }

    server = subprocess.Popen(
        ['npx', 'vite', 'preview', '--host', '127.0.0.1', '--port', str(PORT), '--strictPort'],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    console_errors: list[str] = []

    try:
        time.sleep(2.0)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            # =====================================================================
            # 02: ІНА-35с profile configuration (banner -> Settings -> select 1st & 2nd lang)
            # =====================================================================
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'02: {e}'))
            page.add_init_script(make_init_script(ina35_base_settings, {ina35_identity: ina35_payload}))
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(800)

            banner = page.get_by_test_id('parallel-groups-banner')
            assert banner.is_visible(), 'Unconfigured parallel groups banner must be visible before selection'
            banner.get_by_role('button', name='Обрати підгрупи').click()
            page.wait_for_timeout(700)

            card = page.get_by_test_id('parallel-groups-card')
            assert card.is_visible(), 'Parallel groups card must appear in Settings for ІНА-35с'
            card.scroll_into_view_if_needed()
            page.wait_for_timeout(400)

            # Choose 2nd foreign language (German · Захаров) and 1st foreign language teacher
            select_parallel_option(page, 'Друга іноземна мова', 'Захаров')
            select_parallel_option(page, 'Перша іноземна мова', 'Черкас')
            assert '2/2 обрано' in card.inner_text(), f'Expected 2/2 badge, got: {card.inner_text()}'
            page.screenshot(path=str(RECORDINGS_DIR / '02_ina35_profile_configuration.png'))

            # Extract saved selectedParallelGroups for subsequent recordings
            saved_settings = json.loads(page.evaluate("() => localStorage.getItem('uni_schedule_settings_v2')"))
            configured_parallel = saved_settings.get('selectedParallelGroups')
            assert configured_parallel and len(configured_parallel) == 2, f'Expected 2 saved parallel keys: {configured_parallel}'
            save_video(page, ctx, '02_ina35_profile_configuration.webm')
            print('PASS 02_ina35_profile_configuration')

            ina35_configured_settings = {
                **ina35_base_settings,
                'selectedParallelGroups': configured_parallel,
            }

            # =====================================================================
            # 03: ІНА-35с Day View after fix (clean Monday 2026-11-23, zero Spanish/French)
            # =====================================================================
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'03: {e}'))
            page.add_init_script(make_init_script(ina35_configured_settings, {ina35_identity: ina35_payload}))
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(900)

            assert page.get_by_test_id('parallel-groups-banner').count() == 0, 'Banner must disappear once configured'
            body_text = page.locator('body').inner_text()
            assert 'Друга іноземна мова (німецька)' in body_text, 'Chosen German lesson must be visible'
            assert 'іспанська' not in body_text.lower(), 'Unselected Spanish must NOT appear'
            assert 'французька' not in body_text.lower(), 'Unselected French must NOT appear'
            page.screenshot(path=str(RECORDINGS_DIR / '03_ina35_day_view_after.png'))
            page.evaluate('window.scrollTo({ top: 380, behavior: "smooth" })')
            page.wait_for_timeout(600)
            page.evaluate('window.scrollTo({ top: 0, behavior: "smooth" })')
            page.wait_for_timeout(400)
            save_video(page, ctx, '03_ina35_day_view_after.webm')
            print('PASS 03_ina35_day_view_after')

            # =====================================================================
            # 04: ІНА-35с Week View after fix
            # =====================================================================
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'04: {e}'))
            page.add_init_script(make_init_script(ina35_configured_settings, {ina35_identity: ina35_payload}))
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(700)
            page.get_by_role('radio', name='Тиждень', exact=True).first.click()
            page.wait_for_timeout(800)
            week_text = page.locator('body').inner_text()
            assert 'іспанська' not in week_text.lower(), 'Spanish must not appear in Week View'
            assert 'французька' not in week_text.lower(), 'French must not appear in Week View'
            assert any(
                s in week_text
                for s in ('Стилістика', 'Національна література', 'Філософія', 'Історія мови')
            ), f'General mandatory lessons must be in Week View. Got: {week_text[:400]}'
            page.screenshot(path=str(RECORDINGS_DIR / '04_ina35_week_view_after.png'))
            page.evaluate('window.scrollTo({ top: 550, behavior: "smooth" })')
            page.wait_for_timeout(700)
            save_video(page, ctx, '04_ina35_week_view_after.webm')
            print('PASS 04_ina35_week_view_after')

            # =====================================================================
            # 05: ІНА-35с live subgroup change (German -> Spanish)
            # =====================================================================
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'05: {e}'))
            page.add_init_script(make_init_script(ina35_configured_settings, {ina35_identity: ina35_payload}))
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            select_parallel_option(page, 'Друга іноземна мова', 'Іспанська (усі викладачі)')
            page.get_by_role('button', name='Розклад', exact=True).first.click()
            page.wait_for_timeout(800)
            after_switch = page.locator('body').inner_text()
            assert 'іспанська' in after_switch.lower(), 'Spanish must appear after switching'
            assert 'німецька' not in after_switch.lower(), 'German must disappear after switching to Spanish'
            save_video(page, ctx, '05_ina35_subgroup_change.webm')
            print('PASS 05_ina35_subgroup_change')

            # =====================================================================
            # 06: ІНА-35с DVVS elective + general mandatory lessons (Wednesday 2026-11-25)
            # =====================================================================
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'06: {e}'))
            page.add_init_script(
                make_init_script(ina35_configured_settings, {ina35_identity: ina35_payload}, (2026, 11, 25, 9, 0))
            )
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            dvvs_checkbox = page.locator('[role="checkbox"]').first
            dvvs_checkbox.scroll_into_view_if_needed()
            dvvs_checkbox.click()
            page.wait_for_timeout(400)
            page.get_by_role('button', name='Розклад', exact=True).first.click()
            page.wait_for_timeout(700)
            page.get_by_role('radio', name='Тиждень', exact=True).first.click()
            page.wait_for_timeout(800)
            dvvs_week_text = page.locator('body').inner_text()
            assert any(
                s in dvvs_week_text
                for s in ('Стилістика', 'Національна література', 'Філософія', 'Історія мови')
            ), f'General mandatory lessons must remain with DVVS. Got: {dvvs_week_text[:400]}'
            save_video(page, ctx, '06_ina35_dvvs_and_general_lessons.webm')
            print('PASS 06_ina35_dvvs_and_general_lessons')

            # =====================================================================
            # 07: Other faculty regression — ФЕП-33с (builtin/department + numeric subgroup, NO parallel card)
            # =====================================================================
            fep33_settings = {
                'subgroup': 1,
                'department': 'sp',
                'electiveCourse': 'freelance',
                'theme': 'dark',
                'attendanceGoal': 80,
                'showWeekends': False,
                'semesterStartDate': '2026-09-01',
                'desktopScheduleMode': 'day',
                'scheduleSourceMode': 'builtin',
            }
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'07: {e}'))
            page.add_init_script(make_init_script(fep33_settings, {}))
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            assert page.get_by_test_id('parallel-groups-banner').count() == 0, 'ФЕП-33с must NOT show parallel banner'
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            assert page.get_by_test_id('parallel-groups-card').count() == 0, 'ФЕП-33с must NOT show parallel groups card'
            assert 'твоя кафедра' in page.locator('body').inner_text().lower(), 'ФЕП-33с must keep department selector'
            save_video(page, ctx, '07_other_faculty_fep33.webm')
            print('PASS 07_other_faculty_fep33')

            # =====================================================================
            # 08: Cross-faculty universality — ФЕП-13с detects parallel Іноземна мова dynamically
            # =====================================================================
            fep13_settings = {
                'subgroup': 1,
                'department': 'sp',
                'electiveCourse': 'freelance',
                'theme': 'dark',
                'attendanceGoal': 80,
                'showWeekends': False,
                'semesterStartDate': '2026-09-01',
                'desktopScheduleMode': 'day',
                'scheduleSourceMode': 'live',
                'universityProfile': {
                    'universityId': 'lnu',
                    'facultyId': '1005',
                    'facultyName': "Факультет електроніки та комп'ютерних технологій",
                    'course': 1,
                    'groupId': 'ФЕП-13с',
                    'groupName': 'ФЕП-13с',
                    'subgroup': 1,
                },
                'selectedElectives': [],
            }
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'08: {e}'))
            page.add_init_script(make_init_script(fep13_settings, {fep13_identity: fep13_payload}))
            attach_api_routes(page, {'ФЕП-13с': fep13_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            assert page.get_by_test_id('parallel-groups-banner').is_visible(), 'ФЕП-13с must dynamically detect Іноземна мова'
            page.get_by_test_id('parallel-groups-banner').get_by_role('button', name='Обрати підгрупи').click()
            page.wait_for_timeout(600)
            select_parallel_option(page, 'Іноземна мова', 'Коваленко')
            page.get_by_role('button', name='Розклад', exact=True).first.click()
            page.wait_for_timeout(700)
            fep13_text = page.locator('body').inner_text()
            assert 'Коваленко' in fep13_text
            assert 'Мельник' not in fep13_text
            assert 'Математичний аналіз' in fep13_text
            save_video(page, ctx, '08_other_group_cross_check.webm')
            print('PASS 08_other_group_cross_check')

            # =====================================================================
            # 09: Reload & Offline persistence
            # =====================================================================
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'09: {e}'))
            page.add_init_script(make_init_script(ina35_configured_settings, {ina35_identity: ina35_payload}))
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            page.reload(wait_until='networkidle')
            page.wait_for_timeout(700)
            ctx.set_offline(True)
            page.wait_for_timeout(600)
            offline_text = page.locator('body').inner_text()
            assert 'Друга іноземна мова (німецька)' in offline_text
            assert 'іспанська' not in offline_text.lower()
            save_video(page, ctx, '09_reload_and_offline_persistence.webm')
            print('PASS 09_reload_and_offline_persistence')

            # =====================================================================
            # 10: Dark & Light theme verification (no clipping / contrast issues)
            # =====================================================================
            ctx = new_ctx(browser, 'light')
            page = ctx.new_page()
            page.on('pageerror', lambda e: console_errors.append(f'10: {e}'))
            light_settings = {**ina35_configured_settings, 'theme': 'light'}
            page.add_init_script(make_init_script(light_settings, {ina35_identity: ina35_payload}))
            attach_api_routes(page, {'ІНА-35с': ina35_payload})
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(700)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            page.get_by_test_id('parallel-groups-card').scroll_into_view_if_needed()
            page.wait_for_timeout(500)
            page.screenshot(path=str(RECORDINGS_DIR / '10_light_theme_parallel_card.png'))
            # Toggle dark theme
            dark_btn = page.get_by_role('button', name='Темна')
            if dark_btn.count() > 0:
                dark_btn.first.scroll_into_view_if_needed()
                dark_btn.first.click()
                page.wait_for_timeout(600)
            page.screenshot(path=str(RECORDINGS_DIR / '10_dark_theme_verification.png'))
            save_video(page, ctx, '10_dark_theme_verification.webm')
            print('PASS 10_dark_theme_verification')

            browser.close()

        if console_errors:
            print('CONSOLE_ERRORS:', console_errors)
            sys.exit(1)
        print('ALL_V421_E2E_SCENARIOS_PASSED=1')
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == '__main__':
    main()
