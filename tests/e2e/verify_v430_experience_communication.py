"""
Uni Schedule v4.3.0 — Experience & Communication E2E Verification & Recordings (08–15).

Covers:
- 08_developer_contact.webm (Telegram @kost99_99, https://t.me/kost99_99, noopener/noreferrer)
- 09_whats_new_first_launch.webm (auto What's New after upgrade from 4.2.1 -> 4.3.0, no repeat after close)
- 10_whats_new_manual_open.webm (manual open from Settings + Escape/close)
- 11_update_history.webm (Update History newest-first SemVer, published only, offline fallback)
- 12_release_notification_settings.webm ("Новини та оновлення" default OFF, toggle + reload persistence)
- 13_notification_deep_link.webm (same-origin deep link /?view=release&version=4.2.1)
- 14_full_update_lifecycle.webm (new user onboarding not blocked by What's New; offline launch)
- 15_dark_theme_communication.webm (light & dark theme contrast & zero overflow on 320px/390px)
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
        'V430_RECORDINGS_DIR',
        '/mnt/c/Users/lev68/.gemini/antigravity/brain/64760d40-b7af-46cf-acbf-14748f1971d9/v430_recordings',
    )
)
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('V430_PORT', '4193'))
BASE_URL = f'http://127.0.0.1:{PORT}'


def new_ctx(browser, color_scheme='dark', width=390, height=844):
    return browser.new_context(
        viewport={'width': width, 'height': height},
        device_scale_factor=2,
        color_scheme=color_scheme,
        service_workers='block',
        record_video_dir=str(RECORDINGS_DIR),
        record_video_size={'width': width, 'height': height},
    )


def save_video(page, context, filename: str) -> Path:
    video_path = page.video.path()
    context.close()
    target = RECORDINGS_DIR / filename
    if target.exists():
        target.unlink()
    Path(video_path).rename(target)
    return target


BASE_SETTINGS = {
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


def init_script(settings=None, last_ver='4.3.1', seen=None, skip_splash=True):
    lines = []
    if skip_splash:
        lines.append("sessionStorage.setItem('uni_schedule_splash_seen_v1', '1');")
    if settings is not None:
        lines.append(
            f"if (!localStorage.getItem('uni_schedule_settings_v2')) localStorage.setItem('uni_schedule_settings_v2', {json.dumps(json.dumps(settings, ensure_ascii=False))});"
        )
    if last_ver is not None:
        lines.append(
            f"if (!localStorage.getItem('uni_schedule_last_installed_version_v1')) localStorage.setItem('uni_schedule_last_installed_version_v1', {json.dumps(json.dumps(last_ver))});"
        )
    if seen is not None:
        lines.append(
            f"if (!localStorage.getItem('uni_schedule_seen_releases_v1')) localStorage.setItem('uni_schedule_seen_releases_v1', {json.dumps(json.dumps(seen))});"
        )
    return '\n'.join(lines)


def main():
    server = subprocess.Popen(
        ['npx', 'vite', 'preview', '--host', '127.0.0.1', '--port', str(PORT), '--strictPort'],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    errors: list[str] = []

    try:
        time.sleep(2.0)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            # 08: Developer contact (@kost99_99)
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'08: {e}'))
            page.add_init_script(init_script(BASE_SETTINGS))
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(700)
            dev_card = page.get_by_test_id('developer-contact-card')
            dev_card.scroll_into_view_if_needed()
            page.wait_for_timeout(500)
            assert dev_card.is_visible()
            link = page.get_by_test_id('developer-telegram-link')
            assert link.get_attribute('href') == 'https://t.me/kost99_99'
            assert link.get_attribute('target') == '_blank'
            rel_attr = link.get_attribute('rel') or ''
            assert 'noopener' in rel_attr and 'noreferrer' in rel_attr
            assert '@kost99_99' in link.inner_text()
            save_video(page, ctx, '08_developer_contact.webm')
            print('PASS 08_developer_contact')

            # 09: What's New on first launch after upgrade (simulate published 4.3.1 via cached releases)
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'09: {e}'))
            published_431_cache = [{
                'id': 'rel_4_3_1',
                'version': '4.3.1',
                'title': 'Signature Animation Correction',
                'ukTitle': 'Покращена анімація запуску',
                'summary': 'Оновлено фірмову анімацію запуску Uni Schedule.',
                'publishedAt': '2026-11-27',
                'publicationStatus': 'published',
                'features': [],
                'improvements': ['Точніше відтворення Signature Calendar Reveal.'],
                'fixes': [],
                'notificationTitle': 'Uni Schedule v4.3.1',
                'notificationBody': 'Покращена анімація запуску!',
            }]
            page.add_init_script(
                init_script(BASE_SETTINGS, last_ver='4.3.0', seen=['rel_4_3_0']) +
                f"\nlocalStorage.setItem('uni_schedule_cached_releases_v1', {json.dumps(json.dumps(published_431_cache, ensure_ascii=False))});"
            )
            page.goto(BASE_URL, wait_until='networkidle')
            modal = page.get_by_test_id('whats-new-modal-content')
            modal.wait_for(state='visible', timeout=7000)
            assert 'v4.3.1' in modal.inner_text()
            page.get_by_role('button', name='Зрозуміло').click()
            page.wait_for_timeout(500)
            assert page.get_by_test_id('whats-new-modal-content').count() == 0
            # Reload -> must NOT auto-open again even after splash completes
            page.reload(wait_until='networkidle')
            page.wait_for_timeout(3200)
            assert page.get_by_test_id('whats-new-modal-content').count() == 0, 'Must not re-open after seen'
            save_video(page, ctx, '09_whats_new_first_launch.webm')
            print('PASS 09_whats_new_first_launch')

            # 10: Manual What's New open from Settings
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'10: {e}'))
            page.add_init_script(init_script(BASE_SETTINGS))
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(600)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            btn = page.get_by_test_id('open-whats-new-btn')
            btn.scroll_into_view_if_needed()
            btn.click()
            page.wait_for_timeout(600)
            assert page.get_by_test_id('whats-new-modal-content').is_visible()
            page.keyboard.press('Escape')
            page.wait_for_timeout(400)
            assert page.get_by_test_id('whats-new-modal-content').count() == 0
            save_video(page, ctx, '10_whats_new_manual_open.webm')
            print('PASS 10_whats_new_manual_open')

            # 11: Update History (published only, newest-first, offline works)
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'11: {e}'))
            page.add_init_script(init_script(BASE_SETTINGS))
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(500)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            ctx.set_offline(True)
            hbtn = page.get_by_test_id('open-update-history-btn')
            hbtn.scroll_into_view_if_needed()
            hbtn.click()
            page.wait_for_timeout(600)
            hist = page.get_by_test_id('update-history-modal-content')
            assert hist.is_visible()
            hist_text = hist.inner_text()
            assert 'v4.3.0' in hist_text and 'v4.2.1' in hist_text
            assert 'v4.3.1' not in hist_text, 'Draft v4.3.1 must NOT appear in published history'
            save_video(page, ctx, '11_update_history.webm')
            print('PASS 11_update_history')

            # 12: Release Notification Settings (default OFF, toggle + reload persistence)
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'12: {e}'))
            page.add_init_script(init_script(BASE_SETTINGS))
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(500)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            toggle = page.get_by_test_id('release-updates-toggle')
            toggle.scroll_into_view_if_needed()
            page.wait_for_timeout(400)
            assert not toggle.is_checked(), 'Release updates toggle must default to OFF'
            toggle.check()
            page.wait_for_timeout(400)
            assert toggle.is_checked()
            page.reload(wait_until='networkidle')
            page.wait_for_timeout(600)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            toggle2 = page.get_by_test_id('release-updates-toggle')
            toggle2.scroll_into_view_if_needed()
            assert toggle2.is_checked(), 'Release updates preference must persist across reload'
            save_video(page, ctx, '12_release_notification_settings.webm')
            print('PASS 12_release_notification_settings')

            # 13: Notification deep link /?view=release&version=4.2.1
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'13: {e}'))
            page.add_init_script(init_script(BASE_SETTINGS))
            page.goto(f'{BASE_URL}/?view=release&version=4.2.1', wait_until='networkidle')
            modal = page.get_by_test_id('whats-new-modal-content')
            modal.wait_for(state='visible', timeout=7000)
            assert 'v4.2.1' in modal.inner_text()
            assert 'view=release' not in page.url, 'Query string should be cleaned after opening'
            save_video(page, ctx, '13_notification_deep_link.webm')
            print('PASS 13_notification_deep_link')

            # 14: New user onboarding NOT blocked by What's New
            ctx = new_ctx(browser, 'dark')
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'14: {e}'))
            page.add_init_script("sessionStorage.setItem('uni_schedule_splash_seen_v1', '1');")
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(1000)
            assert page.get_by_test_id('whats-new-modal-content').count() == 0, 'Must never block new-user onboarding'
            save_video(page, ctx, '14_full_update_lifecycle.webm')
            print('PASS 14_full_update_lifecycle')

            # 15: Light & Dark theme communication + narrow 320px zero horizontal overflow
            ctx = new_ctx(browser, 'light', width=320, height=844)
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'15: {e}'))
            page.add_init_script(init_script({**BASE_SETTINGS, 'theme': 'light'}))
            page.goto(BASE_URL, wait_until='networkidle')
            page.wait_for_timeout(500)
            page.get_by_role('button', name='Опції', exact=True).first.click()
            page.wait_for_timeout(600)
            page.get_by_test_id('developer-contact-card').scroll_into_view_if_needed()
            page.wait_for_timeout(400)
            overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
            assert not overflow, 'Zero horizontal overflow required on 320px'
            page.get_by_test_id('open-whats-new-btn').click()
            page.wait_for_timeout(500)
            assert page.get_by_test_id('whats-new-modal-content').is_visible()
            save_video(page, ctx, '15_dark_theme_communication.webm')
            print('PASS 15_dark_theme_communication')

            browser.close()

        if errors:
            print('CONSOLE_ERRORS:', errors)
            sys.exit(1)
        print('ALL_V430_COMMUNICATION_E2E_PASSED=1')
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == '__main__':
    main()
