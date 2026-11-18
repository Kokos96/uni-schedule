import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  coalesceMutation,
  mergeAttendanceWithRemote,
  toLocalStatus,
  toSyncStatus,
  type AttendanceMutation,
} from '../../src/services/attendanceSync';
import type { AttendanceRecord } from '../../src/types';

describe('services/attendanceSync (frontend offline-first LWW)', () => {
  it('coalesces repeated offline edits to the same lesson+date keeping latest timestamp', () => {
    const q1 = coalesceMutation([], {
      lessonId: 'mon_1_sp',
      lessonDate: '2026-11-18',
      status: 'attended',
      updatedAt: '2026-11-18T08:30:00.000Z',
    });
    const q2 = coalesceMutation(q1, {
      lessonId: 'mon_1_sp',
      lessonDate: '2026-11-18',
      status: 'absent',
      updatedAt: '2026-11-18T08:35:00.000Z',
    });
    // Older timestamp arriving out-of-order must not overwrite newer one
    const q3 = coalesceMutation(q2, {
      lessonId: 'mon_1_sp',
      lessonDate: '2026-11-18',
      status: 'excused',
      updatedAt: '2026-11-18T08:20:00.000Z',
    });

    assert.equal(q3.length, 1);
    assert.equal(q3[0]?.status, 'absent');
    assert.equal(toLocalStatus('attended'), 'present');
    assert.equal(toSyncStatus('present'), 'attended');
    assert.equal(toSyncStatus(null), 'unmarked');
  });

  it('migrates legacy uni_schedule_attendance_v1 records without updatedAt and applies remote tombstones', () => {
    // Legacy v1 record has no updatedAt
    const legacyLocal: AttendanceRecord[] = [
      { lessonId: 'mon_1_sp', date: '2026-11-16', status: 'present' },
      { lessonId: 'tue_2_sp', date: '2026-11-17', status: 'absent' },
    ];

    const remote = [
      {
        lessonId: 'mon_1_sp',
        lessonDate: '2026-11-16',
        status: 'unmarked' as const, // Deleted on another device
        updatedAt: '2026-11-18T10:00:00.000Z',
      },
      {
        lessonId: 'wed_1_sp',
        lessonDate: '2026-11-18',
        status: 'excused' as const,
        updatedAt: '2026-11-18T10:05:00.000Z',
      },
    ];

    const pendingOffline: AttendanceMutation[] = [
      {
        lessonId: 'tue_2_sp',
        lessonDate: '2026-11-17',
        status: 'attended',
        updatedAt: '2026-11-18T11:00:00.000Z',
      },
    ];

    const merged = mergeAttendanceWithRemote(legacyLocal, remote, pendingOffline);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((r) => r.lessonId === 'mon_1_sp'), undefined); // Tombstone applied!
    assert.equal(merged.find((r) => r.lessonId === 'tue_2_sp')?.status, 'present'); // Pending offline edit preserved!
    assert.equal(merged.find((r) => r.lessonId === 'wed_1_sp')?.status, 'excused');
  });
});
