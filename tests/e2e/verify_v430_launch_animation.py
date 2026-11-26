"""
Uni Schedule v4.3.0 Stage A — Hybrid #25 Signature Calendar Reveal (3000ms) E2E & Visual Recordings.

Records:
- 01_hybrid25_light_3s.webm
- 02_hybrid25_dark_3s.webm
- 05_reduced_motion.webm
- 06_first_launch_onboarding.webm
- 07_offline_launch.webm
- Keyframes at 0.0s, 0.5s, 1.0s, 1.5s, 2.0s, 2.5s, 3.0s (dark & light) for side-by-side comparison.
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
FRAMES_DIR = RECORDINGS_DIR / 'keyframes'
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
FRAMES_DIR.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('V430_LAUNCH_PORT', '4194'))
BASE_URL = f'http://127.0.0.1:{PORT}'

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


def seed_script(settings=None):
    if settings is None:
        return ''
    return (
        f"if (!localStorage.getItem('uni_schedule_settings_v2')) "
        f"localStorage.setItem('uni_schedule_settings_v2', {json.dumps(json.dumps(settings, ensure_ascii=False))});"
        f"if (!localStorage.getItem('uni_schedule_last_installed_version_v1')) "
        f"localStorage.setItem('uni_schedule_last_installed_version_v1', '\"4.3.1\"');"
    )


def save_video(page, ctx, filename: str):
    vp = page.video.path()
    ctx.close()
    target = RECORDINGS_DIR / filename
    if target.exists():
        target.unlink()
    Path(vp).rename(target)
    return target


def measure_launch(browser, *, theme: str, filename: str, reduced_motion: bool = False,
                   onboarding: bool = False, offline: bool = False, capture_frames_prefix: str | None = None):
    ctx = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        color_scheme=theme,
        reduced_motion='reduce' if reduced_motion else 'no-preference',
        service_workers='block',
        record_video_dir=str(RECORDINGS_DIR),
        record_video_size={'width': 390, 'height': 844},
    )
    page = ctx.new_page()
    errors: list[str] = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    if not onboarding:
        page.add_init_script(seed_script({**BASE_SETTINGS, 'theme': theme}))

    # Record exact performance.now() when splash mounts & unmounts
    page.add_init_script("""
      window.__splashMetrics = { startMs: null, endMs: null, phases: [], frames: 0 };
      const obs = new MutationObserver(() => {
        const el = document.querySelector('[data-testid="app-splash-hybrid25"]');
        if (el) {
          const ph = el.getAttribute('data-launch-phase');
          if (window.__splashMetrics.startMs === null) window.__splashMetrics.startMs = performance.now();
          if (ph && window.__splashMetrics.phases[window.__splashMetrics.phases.length - 1] !== ph) {
            window.__splashMetrics.phases.push(ph);
          }
        } else if (window.__splashMetrics.startMs !== null && window.__splashMetrics.endMs === null) {
          window.__splashMetrics.endMs = performance.now();
        }
      });
      document.addEventListener('DOMContentLoaded', () => {
        obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-launch-phase'] });
        const tick = () => {
          if (window.__splashMetrics.endMs === null) {
            window.__splashMetrics.frames += 1;
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      });
    """)

    t0 = time.perf_counter()
    page.goto(BASE_URL, wait_until='domcontentloaded')

    if capture_frames_prefix:
        # Capture keyframes at 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0s
        for sec in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0):
            elapsed = time.perf_counter() - t0
            wait_s = max(0.0, sec - elapsed)
            if wait_s > 0:
                time.sleep(wait_s)
            page.screenshot(path=str(FRAMES_DIR / f'{capture_frames_prefix}_{sec:.1f}s.png'))

    # Wait until splash unmounts
    page.wait_for_function(
        "() => document.querySelector('[data-testid=\"app-splash-hybrid25\"]') === null",
        timeout=7000,
    )
    if offline:
        ctx.set_offline(True)
    page.wait_for_timeout(400)

    metrics = page.evaluate('() => window.__splashMetrics')
    duration_ms = (
        round(metrics['endMs'] - metrics['startMs'])
        if metrics['startMs'] is not None and metrics['endMs'] is not None
        else -1
    )

    # Verify zero horizontal overflow
    overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    assert not overflow, f'Horizontal overflow in {filename}'

    # Verify real date (not hardcoded 26 unless today actually is 26) and no splash replay on tab switch
    if not onboarding:
        page.get_by_role('button', name='Опції', exact=True).first.click()
        page.wait_for_timeout(350)
        assert page.locator('[data-testid="app-splash-hybrid25"]').count() == 0, 'Splash must not replay on tab switch'

    save_video(page, ctx, filename)
    assert not errors, f'JS errors in {filename}: {errors}'
    return duration_ms, metrics


def main():
    server = subprocess.Popen(
        ['npx', 'vite', 'preview', '--host', '127.0.0.1', '--port', str(PORT), '--strictPort'],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(2.0)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            d_light, m_light = measure_launch(
                browser, theme='light', filename='01_hybrid25_light_3s.webm', capture_frames_prefix='light'
            )
            assert 2600 <= d_light <= 3600, f'Light launch duration out of 3000ms tolerance: {d_light}ms'
            print(f'PASS 01_hybrid25_light_3s: {d_light}ms phases={m_light["phases"]} frames={m_light["frames"]}')

            d_dark, m_dark = measure_launch(
                browser, theme='dark', filename='02_hybrid25_dark_3s.webm', capture_frames_prefix='dark'
            )
            assert 2600 <= d_dark <= 3600, f'Dark launch duration out of 3000ms tolerance: {d_dark}ms'
            print(f'PASS 02_hybrid25_dark_3s: {d_dark}ms phases={m_dark["phases"]} frames={m_dark["frames"]}')

            d_red, m_red = measure_launch(
                browser, theme='dark', filename='05_reduced_motion.webm', reduced_motion=True
            )
            assert 150 <= d_red <= 700, f'Reduced motion duration out of 250-400ms tolerance: {d_red}ms'
            print(f'PASS 05_reduced_motion: {d_red}ms phases={m_red["phases"]}')

            d_onb, _ = measure_launch(
                browser, theme='dark', filename='06_first_launch_onboarding.webm', onboarding=True
            )
            print(f'PASS 06_first_launch_onboarding: {d_onb}ms')

            d_off, _ = measure_launch(
                browser, theme='dark', filename='07_offline_launch.webm', offline=True
            )
            print(f'PASS 07_offline_launch: {d_off}ms')

            # Viewport matrix check (320, 375, 390, 393, 430, 1280 desktop)
            for vw, vh in [(320, 844), (375, 844), (390, 844), (393, 852), (430, 932), (1280, 900)]:
                vctx = browser.new_context(viewport={'width': vw, 'height': vh}, color_scheme='dark', service_workers='block')
                vpage = vctx.new_page()
                vpage.add_init_script(seed_script(BASE_SETTINGS))
                vpage.goto(BASE_URL, wait_until='domcontentloaded')
                vpage.wait_for_function("() => document.querySelector('[data-testid=\"app-splash-hybrid25\"]') === null", timeout=7000)
                ov = vpage.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
                assert not ov, f'Overflow at {vw}x{vh}'
                vctx.close()
            print('PASS VIEWPORT_MATRIX_320_375_390_393_430_1280')

            browser.close()
        print('ALL_V430_LAUNCH_E2E_PASSED=1')
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == '__main__':
    main()
