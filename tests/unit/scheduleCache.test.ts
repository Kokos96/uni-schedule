import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedSchedule, StudentSelection } from '../../src/integrations/universities/types';
import {
  clearCachedSchedules, readCachedSchedule, scheduleIdentity,
  shouldRefreshSchedule, writeCachedSchedule,
} from '../../src/hooks/scheduleCache';

function withStorage(run: (storage: Map<string, string>) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } },
  });
  try { run(values); } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function schedule(groupId: string, facultyId = '1005'): NormalizedSchedule {
  return {
    universityId: 'lnu', universityName: 'ЛНУ', facultyId,
    groupId, groupName: groupId, fetchedAt: '2026-11-25T09:00:00.000Z',
    sourceType: 'dated', coveredFrom: '2026-11-23', coveredTo: '2026-12-06',
    warnings: [],
    lessons: [{
      id: `${groupId}-1`, date: '2026-11-25', dayOfWeek: 3, number: 1,
      startTime: '08:30', endTime: '09:50', subject: 'Тест', lessonType: 'Л',
      universityId: 'lnu',
    }],
  };
}

function profile(groupId: string, facultyId = '1005'): StudentSelection {
  return { universityId: 'lnu', facultyId, groupId, groupName: groupId };
}

describe('schedule cache identity and recovery', () => {
  it('keeps multiple groups and faculties isolated after reload', () => withStorage(() => {
    assert.equal(writeCachedSchedule(schedule('ФЕП-33с')), true);
    assert.equal(writeCachedSchedule(schedule('ПМІ-41', '1013')), true);
    assert.equal(readCachedSchedule(profile('ФЕП-33с'))?.groupId, 'ФЕП-33с');
    assert.equal(readCachedSchedule(profile('ПМІ-41', '1013'))?.groupId, 'ПМІ-41');
    assert.equal(readCachedSchedule(profile('ФЕП-33с', '1013')), null);
    assert.notEqual(scheduleIdentity(profile('ФЕП-33с')), scheduleIdentity(profile('ФЕП-33с', '1013')));
  }));

  it('migrates matching v2 without claiming unknown date coverage', () => withStorage((storage) => {
    const legacy = schedule('ФЕП-33с');
    delete legacy.coveredFrom;
    delete legacy.coveredTo;
    delete legacy.sourceType;
    storage.set('uni_schedule_cached_group_v2', JSON.stringify({ schemaVersion: 2, schedule: legacy }));
    assert.equal(readCachedSchedule(profile('ПМІ-41')), null);
    const restored = readCachedSchedule(profile('ФЕП-33с'));
    assert.equal(restored?.sourceType, 'dated');
    assert.equal(restored?.coveredFrom, undefined);
    assert.equal(shouldRefreshSchedule(restored, '2026-11-25', Date.parse('2026-11-25T10:00:00Z')), true);
    assert.ok(storage.has('uni_schedule_cached_group_v3'));
  }));

  it('refreshes only stale or uncovered dated schedules and clears only schedule keys', () => withStorage((storage) => {
    const fresh = schedule('ФЕП-33с');
    assert.equal(shouldRefreshSchedule(fresh, '2026-11-25', Date.parse('2026-11-25T10:00:00Z')), false);
    assert.equal(shouldRefreshSchedule(fresh, '2026-12-07', Date.parse('2026-11-25T10:00:00Z')), true);
    assert.equal(shouldRefreshSchedule(fresh, '2026-11-25', Date.parse('2026-11-26T10:00:00Z')), true);
    writeCachedSchedule(fresh);
    storage.set('uni_schedule_attendance_v2', 'keep');
    clearCachedSchedules();
    assert.equal(readCachedSchedule(profile('ФЕП-33с')), null);
    assert.equal(storage.get('uni_schedule_attendance_v2'), 'keep');
  }));
});
