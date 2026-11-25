"""Run additive schema upgrade against an isolated SQLite database."""
from pathlib import Path
import sqlite3

MIGRATIONS = sorted((Path(__file__).resolve().parents[1] / 'migrations').glob('*.sql'))


def run() -> None:
    db = sqlite3.connect(':memory:')
    for migration in MIGRATIONS:
        if migration.name.startswith('0007_'):
            break
        db.executescript(migration.read_text(encoding='utf-8'))

    db.execute("INSERT INTO users(id,created_at,updated_at) VALUES('legacy','x','x')")
    db.execute(
        """INSERT INTO user_devices(id,user_id,device_name,token_hash,created_at,last_seen_at)
           VALUES('dev-1','legacy','iPhone','hash-1','x','x')"""
    )
    db.execute(
        """INSERT INTO push_subscriptions(id,user_id,device_id,endpoint,p256dh,auth,created_at)
           VALUES('sub-1','legacy','dev-1','https://push.example/1','k','a','x')"""
    )
    db.execute("""INSERT INTO student_profiles(user_id,university_id,group_id,group_name,updated_at)
                  VALUES('legacy','lnu','ФЕП-33с','ФЕП-33с','x')""")
    db.executemany(
        """INSERT INTO attendance_records(user_id,lesson_id,lesson_date,status,updated_at)
           VALUES('legacy',?,?,?,?)""",
        [(f'old-{i}', '2026-11-25', 'present', 'x') for i in range(158)],
    )
    db.commit()

    for migration in MIGRATIONS:
        if migration.name.startswith('0007_'):
            db.executescript(migration.read_text(encoding='utf-8'))

    mode, revision = db.execute(
        "SELECT source_mode, revision FROM student_profiles WHERE user_id='legacy'"
    ).fetchone()
    attendance_count = db.execute(
        "SELECT count(*) FROM attendance_records WHERE user_id='legacy'"
    ).fetchone()[0]
    device_count = db.execute(
        "SELECT count(*) FROM user_devices WHERE user_id='legacy'"
    ).fetchone()[0]
    sub_count = db.execute(
        "SELECT count(*) FROM push_subscriptions WHERE user_id='legacy'"
    ).fetchone()[0]
    assert (mode, revision) == ('live', 1), f'Expected (live, 1), got {(mode, revision)}'
    assert attendance_count == 158
    assert device_count == 1
    assert sub_count == 1
    columns = {row[1] for row in db.execute('PRAGMA table_info(schedule_entries)')}
    assert 'track_number' in columns
    print('Migration 0007 upgrade passed: legacy profile revision=1, 158 attendance, device & push sub preserved')


if __name__ == '__main__':
    run()
