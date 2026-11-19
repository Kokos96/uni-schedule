import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect


APP_URL = "http://127.0.0.1:4173"
WORKER_PORT = 18789
WORKER_URL = f"http://127.0.0.1:{WORKER_PORT}"
REPO_WSL = "/home/kostia/projects/rozklad"


def wait_http_ok(url: str, timeout_s: float = 30.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if 200 <= resp.status < 300:
                    return
        except Exception:
            pass
        time.sleep(0.4)
    raise RuntimeError(f"Service at {url} did not become ready within {timeout_s}s")


def api_json(path: str, method: str = "GET", token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers = {"Origin": APP_URL}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{WORKER_URL}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def switch_to_tuesday(page) -> None:
    mode_group = page.get_by_role("radiogroup", name="Режим перегляду розкладу")
    mode_group.get_by_role("radio", name="День", exact=True).click()
    week_strip_days = page.get_by_role("group", name="Дні тижня").locator("button")
    week_strip_days.nth(1).click()
    expect(page.locator("#main-content h2").first).to_have_text("Вівторок")


def wait_for_sync_record(token: str, expected_status: str, expected_version: int, timeout_s: float = 10.0) -> dict:
    deadline = time.time() + timeout_s
    last_data = {}
    while time.time() < deadline:
        _, data = api_json("/api/attendance", token=token)
        last_data = data
        records = data.get("records", [])
        if records and records[0].get("status") == expected_status and records[0].get("serverVersion") == expected_version:
            return records[0]
        time.sleep(0.25)
    raise AssertionError(f"Expected status={expected_status}, serverVersion={expected_version}, got {last_data}")


def main() -> None:
    tmp_id = f"uni-sync-e2e-{int(time.time())}"
    persist_wsl = f"/tmp/{tmp_id}-d1"
    dist_wsl = f"/tmp/{tmp_id}-dist"

    print("1) Building frontend with VITE_API_BASE_URL and applying isolated local D1 migrations...")
    setup_cmd = (
        f"export PATH=$HOME/.local/node/bin:$PATH; "
        f"cd {REPO_WSL} && "
        f"mkdir -p {persist_wsl} {dist_wsl} && "
        f"VITE_API_BASE_URL={WORKER_URL} npx vite build --outDir {dist_wsl} && "
        f"cd {REPO_WSL}/workers/api && "
        f"npx wrangler d1 migrations apply uni-schedule-db --local --persist-to {persist_wsl}"
    )
    subprocess.run(["wsl", "-e", "bash", "-c", setup_cmd], check=True)

    worker_proc = subprocess.Popen(
        [
            "wsl", "-e", "bash", "-c",
            f"export PATH=$HOME/.local/node/bin:$PATH; cd {REPO_WSL}/workers/api && exec npx wrangler dev --local --port {WORKER_PORT} --persist-to {persist_wsl}"
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    vite_proc = subprocess.Popen(
        [
            "wsl", "-e", "bash", "-c",
            f"export PATH=$HOME/.local/node/bin:$PATH; cd {REPO_WSL} && exec npx vite preview --outDir {dist_wsl} --host 127.0.0.1 --port 4173"
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    try:
        wait_http_ok(f"{WORKER_URL}/api/health", timeout_s=30)
        wait_http_ok(APP_URL, timeout_s=20)
        print("2) Worker + D1 + Vite preview ready. Registering Device A & Device B...")

        status_a, reg_a = api_json("/api/auth/register", method="POST", body={"deviceName": "Playwright-DevA"})
        assert status_a == 201
        status_b, link_b = api_json("/api/devices/link", method="POST", token=reg_a["syncToken"], body={"deviceName": "Playwright-DevB"})
        assert status_b == 201

        auth_a = {"userId": reg_a["userId"], "deviceId": reg_a["deviceId"], "syncToken": reg_a["syncToken"]}
        auth_b = {"userId": link_b["userId"], "deviceId": link_b["deviceId"], "syncToken": link_b["syncToken"]}

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx_a = browser.new_context(viewport={"width": 1280, "height": 900})
            ctx_b = browser.new_context(viewport={"width": 1280, "height": 900})

            ctx_a.add_init_script(f"localStorage.setItem('uni_schedule_sync_token_v1', {json.dumps(json.dumps(auth_a))});")
            ctx_b.add_init_script(f"localStorage.setItem('uni_schedule_sync_token_v1', {json.dumps(json.dumps(auth_b))});")

            page_a = ctx_a.new_page()
            page_b = ctx_b.new_page()

            # Step 1: Device A creates attended ("Був")
            page_a.goto(APP_URL, wait_until="networkidle")
            page_a.evaluate("() => navigator.serviceWorker?.ready")
            switch_to_tuesday(page_a)
            first_group_a = page_a.get_by_role("group", name="Відмітка відвідуваності").first
            first_group_a.get_by_role("button", name="Був").click()
            rec1 = wait_for_sync_record(auth_a["syncToken"], "attended", 1)
            print(f"   PASS Step 1: DevA created attended -> D1 serverVersion={rec1['serverVersion']}")

            # Step 2: Device B receives it
            page_b.goto(APP_URL, wait_until="networkidle")
            switch_to_tuesday(page_b)
            first_group_b = page_b.get_by_role("group", name="Відмітка відвідуваності").first
            expect(first_group_b.get_by_role("button", name="Був")).to_have_attribute("aria-pressed", "true")
            print("   PASS Step 2: DevB pulled attended from D1")

            # Step 3: Device B changes status to absent ("Н-ка")
            first_group_b.get_by_role("button", name="Н-ка").click()
            rec2 = wait_for_sync_record(auth_b["syncToken"], "absent", 2)
            print(f"   PASS Step 3: DevB updated to absent -> D1 serverVersion={rec2['serverVersion']}")

            # Step 4: Device A receives update
            page_a.reload(wait_until="networkidle")
            switch_to_tuesday(page_a)
            first_group_a = page_a.get_by_role("group", name="Відмітка відвідуваності").first
            expect(first_group_a.get_by_role("button", name="Н-ка")).to_have_attribute("aria-pressed", "true")
            print("   PASS Step 4: DevA pulled absent from D1")

            # Step 5 & 6: Device A goes offline and changes status locally to excused ("Поважна")
            ctx_a.set_offline(True)
            first_group_a.get_by_role("button", name="Поважна").click()
            expect(first_group_a.get_by_role("button", name="Поважна")).to_have_attribute("aria-pressed", "true")
            queue_before = page_a.evaluate("() => JSON.parse(localStorage.getItem('uni_schedule_attendance_queue_v1') || '[]')")
            assert len(queue_before) == 1 and queue_before[0]["status"] == "excused", f"Unexpected offline queue: {queue_before}"
            print("   PASS Step 5-6: DevA offline -> local excused queued")

            # Step 7 & 8: Reload PWA while offline and verify offline queue persisted
            page_a.reload(wait_until="domcontentloaded")
            switch_to_tuesday(page_a)
            first_group_a = page_a.get_by_role("group", name="Відмітка відвідуваності").first
            expect(first_group_a.get_by_role("button", name="Поважна")).to_have_attribute("aria-pressed", "true")
            queue_after_reload = page_a.evaluate("() => JSON.parse(localStorage.getItem('uni_schedule_attendance_queue_v1') || '[]')")
            assert len(queue_after_reload) == 1 and queue_after_reload[0]["status"] == "excused"
            print("   PASS Step 7-8: DevA PWA reloaded offline -> offline queue persisted")

            # Step 9 & 10: Return online -> mutation syncs to D1
            ctx_a.set_offline(False)
            page_a.evaluate("() => window.dispatchEvent(new Event('online'))")
            rec3 = wait_for_sync_record(auth_a["syncToken"], "excused", 3)
            page_a.wait_for_function("() => JSON.parse(localStorage.getItem('uni_schedule_attendance_queue_v1') || '[]').length === 0")
            print(f"   PASS Step 9-10: DevA back online -> synced excused to D1 serverVersion={rec3['serverVersion']}")

            # Step 11 & 12: Replay same mutation & verify no duplicates and newer state preserved
            replay_status, replay_body = api_json(
                "/api/attendance/sync",
                method="POST",
                token=auth_a["syncToken"],
                body={
                    "mutations": [
                        {
                            "lessonId": rec3["lessonId"],
                            "lessonDate": rec3["lessonDate"],
                            "status": "excused",
                            "updatedAt": rec3["updatedAt"],
                        }
                    ]
                },
            )
            assert replay_status == 200
            assert replay_body["applied"] == 0 and replay_body["skippedOlder"] == 1
            _, after_replay = api_json("/api/attendance", token=auth_a["syncToken"])
            assert len(after_replay["records"]) == 1
            assert after_replay["records"][0]["status"] == "excused"
            assert after_replay["records"][0]["serverVersion"] == 3
            print("   PASS Step 11-12: Replayed mutation skippedOlder=1, 0 duplicates, state preserved")

            # Extra: unmarked via UI -> D1 serverVersion=4 -> DevB sees unmarked
            first_group_a.get_by_role("button", name="Поважна").click()
            rec4 = wait_for_sync_record(auth_a["syncToken"], "unmarked", 4)
            page_b.reload(wait_until="networkidle")
            switch_to_tuesday(page_b)
            first_group_b = page_b.get_by_role("group", name="Відмітка відвідуваності").first
            for lbl in ("Був", "Н-ка", "Поважна"):
                expect(first_group_b.get_by_role("button", name=lbl)).to_have_attribute("aria-pressed", "false")
            print(f"   PASS Extra unmarked: DevA unmarked -> D1 serverVersion={rec4['serverVersion']} -> DevB unmarked")

            # Extra: stale mutation, clock skew (2099), server_version & baseVersion recovery on real D1
            _, stale_res = api_json(
                "/api/attendance/sync",
                method="POST",
                token=auth_b["syncToken"],
                body={
                    "mutations": [
                        {
                            "lessonId": rec4["lessonId"],
                            "lessonDate": rec4["lessonDate"],
                            "status": "attended",
                            "updatedAt": "2020-01-01T00:00:00.000Z",
                        }
                    ]
                },
            )
            assert stale_res["applied"] == 0 and stale_res["skippedOlder"] == 1

            _, skew_res = api_json(
                "/api/attendance/sync",
                method="POST",
                token=auth_a["syncToken"],
                body={
                    "mutations": [
                        {
                            "lessonId": rec4["lessonId"],
                            "lessonDate": rec4["lessonDate"],
                            "status": "absent",
                            "updatedAt": "2099-01-01T00:00:00.000Z",
                        }
                    ]
                },
            )
            assert skew_res["applied"] == 1
            assert skew_res["records"][0]["updatedAt"] < "2030-01-01"
            assert skew_res["records"][0]["serverVersion"] == 5

            _, base_res = api_json(
                "/api/attendance/sync",
                method="POST",
                token=auth_b["syncToken"],
                body={
                    "mutations": [
                        {
                            "lessonId": rec4["lessonId"],
                            "lessonDate": rec4["lessonDate"],
                            "status": "attended",
                            "updatedAt": "2026-11-19T01:00:00.000Z",
                            "baseVersion": 5,
                        }
                    ]
                },
            )
            assert base_res["applied"] == 1
            assert base_res["records"][0]["status"] == "attended"
            assert base_res["records"][0]["serverVersion"] == 6
            print("   PASS Extra stale/clock-skew(2099)/baseVersion: serverVersion=5->6 verified on real D1")

            browser.close()

        print("\nALL E2E OFFLINE ATTENDANCE SYNC CHECKS PASSED!")
    finally:
        worker_proc.terminate()
        vite_proc.terminate()
        subprocess.run(["wsl", "-e", "bash", "-c", f"rm -rf {persist_wsl} {dist_wsl}"], check=False)


if __name__ == "__main__":
    main()
