import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeSubjectStats,
  filterRecordsBySettings,
  UNRESOLVED_HISTORICAL_SUBJECT,
} from '../../src/utils/attendanceMath';
import {
  buildBackupPayload,
  deduplicateAttendanceRecords,
  parseAndValidateBackup,
} from '../../src/utils/backup';
import { lessonsMap } from '../../src/utils/schedule';
import type { AttendanceRecord } from '../../src/types';

describe('Stage C: 158-record attendance recovery, backup fidelity & deterministic merge', () => {
  it('preserves all 158 historical records even when live scheduleMap is empty or belongs to another group (BUG-032/052)', () => {
    const builtinIds = Array.from(lessonsMap.keys());
    const records: AttendanceRecord[] = Array.from({ length: 158 }, (_, i) => ({
      lessonId: i < 120 ? builtinIds[i % builtinIds.length]! : `lnu_other_d1_p1_hist${i % 4}_all_b`,
      date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
      status: i % 5 === 0 ? 'absent' : 'present',
      updatedAt: '2026-10-15T10:00:00.000Z',
    }));

    // Empty live scheduleMap must not drop builtin historical records
    const emptyMap = new Map();
    const subjectStats = computeSubjectStats(records, emptyMap, 80);
    const totalCounted = subjectStats.reduce((sum, s) => sum + s.totalMarked, 0);
    assert.equal(totalCounted, 158);
    const unresolved = subjectStats.find((s) => s.subjectName === UNRESOLVED_HISTORICAL_SUBJECT);
    assert.equal(unresolved?.totalMarked, 38);

    // filterRecordsBySettings falls back to builtin lessonsMap when live schedule is unloaded
    const filtered = filterRecordsBySettings(
      records,
      { department: 'sp', subgroup: 1, electiveCourse: 'freelance' },
      emptyMap
    );
    assert.ok(filtered.length > 0);
  });

  it('round-trips backup with updatedAt, drops stale serverVersion, preserves profile fields, and merges by newer updatedAt (BUG-034/051/053)', () => {
    const payload = buildBackupPayload({
      attendance: [
        {
          lessonId: 'l1',
          date: '2026-11-20',
          status: 'present',
          updatedAt: '2026-11-20T12:00:00.000Z',
          serverVersion: 99,
        },
      ],
      settings: {
        subgroup: 2,
        department: 'rks',
        electiveCourse: 'both',
        theme: 'dark',
        attendanceGoal: 85,
        showWeekends: false,
        semesterStartDate: '2026-09-01',
        desktopScheduleMode: 'week',
        scheduleSourceMode: 'live',
        selectedElectives: ['el_1'],
        selectedTrack: 2,
        universityProfile: {
          universityId: 'lnu',
          facultyId: '1005',
          facultyName: 'ФЕКТ',
          course: 3,
          groupId: 'ФЕП-33с',
          groupName: 'ФЕП-33с',
          subgroup: 2,
        },
      },
      notes: [],
      deadlines: [],
    });

    const parsed = parseAndValidateBackup(JSON.stringify(payload));
    assert.equal(parsed.valid, true);
    if (!parsed.valid) return;
    assert.equal(parsed.backup.data.attendance[0]?.updatedAt, '2026-11-20T12:00:00.000Z');
    assert.equal(parsed.backup.data.attendance[0]?.serverVersion, undefined);
    assert.equal(parsed.backup.data.settings.scheduleSourceMode, 'live');
    assert.equal(parsed.backup.data.settings.universityProfile?.groupName, 'ФЕП-33с');
    assert.deepEqual(parsed.backup.data.settings.selectedElectives, ['el_1']);
    assert.equal(parsed.backup.data.settings.selectedTrack, 2);

    // Newer updatedAt wins even if earlier in array
    const merged = deduplicateAttendanceRecords([
      { lessonId: 'l1', date: '2026-11-20', status: 'present', updatedAt: '2026-11-21T12:00:00.000Z' },
      { lessonId: 'l1', date: '2026-11-20', status: 'absent', updatedAt: '2026-11-19T12:00:00.000Z' },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.status, 'present');
  });
});
