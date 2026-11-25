import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getVerifiedLnuPrograms,
  resolveVerifiedLnuGroupMetadata,
  validateLnuAcademicSelection,
} from '../../src/data/lnuAcademicCatalog';
import {
  isConfirmedEmptySchedule,
  isScheduleCompatibleWithProfile,
  isValidCachedSchedule,
  readCachedSchedule,
  scheduleIdentity,
  writeCachedSchedule,
} from '../../src/hooks/scheduleCache';
import { handleGetGroups, handleGetSchedule } from '../../workers/api/src/routes/universities';
import type { Env } from '../../workers/api/src/types';
import type { NormalizedSchedule } from '../../src/integrations/universities/types';

function withStorage(run: (storage: Map<string, string>) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      },
    },
  });
  try {
    run(values);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

interface MockGroupRow {
  id: string;
  university_id: string;
  faculty_id: string | null;
  course: number | null;
  group_code: string;
  group_name: string;
  last_synced_at: string | null;
  content_hash: string | null;
  schedule_source_type: 'dated' | 'recurring' | null;
  covered_from: string | null;
  covered_to: string | null;
}

function createMockD1(initialGroups: MockGroupRow[], initialEntries: Record<string, unknown[]> = {}) {
  const groups = new Map<string, MockGroupRow>(initialGroups.map((g) => [g.id, { ...g }]));
  const logs: Array<unknown[]> = [];
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          args = params;
          return stmt;
        },
        async first<T>() {
          if (sql.includes('COUNT(*) as total FROM university_groups')) {
            return { total: groups.size } as T;
          }
          if (sql.includes('FROM schedule_sync_logs')) {
            return { synced_at: new Date().toISOString(), entries_count: groups.size } as T;
          }
          if (sql.includes('FROM university_groups WHERE id = ?')) {
            return (groups.get(String(args[0])) ?? null) as T;
          }
          return null as T;
        },
        async all<T>() {
          if (sql.includes('FROM university_groups')) {
            return { results: Array.from(groups.values()) as T[] };
          }
          if (sql.includes('FROM schedule_entries')) {
            const key = String(args[0]);
            return { results: (initialEntries[key] ?? []) as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO schedule_sync_logs')) {
            logs.push(args);
          }
          if (sql.includes('UPDATE university_groups')) {
            const id = String(args[args.length - 1]);
            const existing = groups.get(id);
            if (existing) {
              const fac = args[0] as string | null;
              if (fac) existing.faculty_id = fac;
            }
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      const results = [];
      for (const s of stmts) results.push(await s.run());
      return results;
    },
  };
  return {
    env: {
      DB: db as unknown as D1Database,
      GROUPS_CACHE_TTL_SECONDS: '86400',
      SCHEDULE_CACHE_TTL_SECONDS: '21600',
    } as Env,
    groups,
    logs,
  };
}

describe('Stage A & B: Verified LNU academic catalog and canonical identity', () => {
  it('resolves verified faculties and programs including homoglyphs and leaves unknown groups unverified', () => {
    const fep = resolveVerifiedLnuGroupMetadata('ФЕП-33с');
    assert.equal(fep?.facultyId, '1005');
    assert.equal(fep?.programId, 'lnu-1005-se');

    const latinFep = resolveVerifiedLnuGroupMetadata('FEP-33c');
    assert.equal(latinFep, null); // F/P are not Cyrillic Ф/П homoglyphs; Ф + Latin E + П + Latin c is:
    const mixedFep = resolveVerifiedLnuGroupMetadata('ФEП-33c');
    assert.equal(mixedFep?.facultyId, '1005');
    assert.equal(mixedFep?.programId, 'lnu-1005-se');

    const ina = resolveVerifiedLnuGroupMetadata('ІНА-21');
    assert.equal(ina?.facultyId, '1007');
    assert.equal(ina?.programId, 'lnu-1007-en');

    const unknown = resolveVerifiedLnuGroupMetadata('ХЗГ-99');
    assert.equal(unknown, null);

    const programs1005 = getVerifiedLnuPrograms('1005');
    assert.ok(programs1005.some((p) => p.id === 'lnu-1005-se'));
    assert.ok(programs1005.every((p) => p.facultyId === '1005'));
  });

  it('rejects contradictory faculty or specialty selections', () => {
    const mismatchFac = validateLnuAcademicSelection({ groupName: 'ІНА-21', facultyId: '1005' });
    assert.equal(mismatchFac.ok, false);

    const mismatchFep = validateLnuAcademicSelection({ groupName: 'ФЕП-33с', facultyId: '1007' });
    assert.equal(mismatchFep.ok, false);

    const mismatchProg = validateLnuAcademicSelection({
      groupName: 'ФЕП-33с',
      facultyId: '1005',
      programId: 'lnu-1005-cs',
    });
    assert.equal(mismatchProg.ok, false);

    const valid = validateLnuAcademicSelection({
      groupName: 'ФЕП-33с',
      facultyId: '1005',
      programId: 'lnu-1005-se',
    });
    assert.equal(valid.ok, true);
  });

  it('accepts confirmed empty dated schedules while rejecting malformed empty schedules', () => withStorage(() => {
    const confirmedEmpty: NormalizedSchedule = {
      universityId: 'lnu',
      universityName: 'ЛНУ ім. Івана Франка',
      facultyId: '1005',
      groupId: 'ФЕП-33с',
      groupName: 'ФЕП-33с',
      fetchedAt: '2026-11-25T10:00:00.000Z',
      sourceType: 'dated',
      coveredFrom: '2026-11-23',
      coveredTo: '2026-12-06',
      lessons: [],
      warnings: ['За обраний період занять за розкладом не знайдено.'],
    };
    assert.equal(isConfirmedEmptySchedule(confirmedEmpty), true);
    assert.equal(isValidCachedSchedule(confirmedEmpty), true);
    assert.equal(writeCachedSchedule(confirmedEmpty), true);
    const restored = readCachedSchedule({
      universityId: 'lnu',
      facultyId: '1005',
      groupId: 'ФEП-33c', // homoglyph alias (Latin E, c)
      groupName: 'ФEП-33c',
    });
    assert.ok(restored);
    assert.equal(restored.groupId, 'ФЕП-33с');
    assert.equal(restored.lessons.length, 0);

    const malformedEmpty: NormalizedSchedule = {
      ...confirmedEmpty,
      coveredFrom: undefined,
      coveredTo: undefined,
    };
    assert.equal(isConfirmedEmptySchedule(malformedEmpty), false);
    assert.equal(isValidCachedSchedule(malformedEmpty), false);

    // Homoglyph identity consistency
    assert.equal(
      scheduleIdentity({ universityId: 'lnu', facultyId: '1005', groupId: 'ФЕП-33с' }),
      scheduleIdentity({ universityId: 'lnu', facultyId: '1005', groupId: 'ФEП-33c' })
    );
    assert.equal(
      isScheduleCompatibleWithProfile(
        { universityId: 'lnu', facultyId: '1005', groupId: 'ФЕП-33с' },
        { universityId: 'lnu', facultyId: '1007', groupId: 'ФЕП-33с' }
      ),
      false
    );
  }));

  it('strictly filters faculty/program groups and separates explicit global search on backend', async () => {
    const { env } = createMockD1([
      {
        id: 'lnu:ФЕП-33с',
        university_id: 'lnu',
        faculty_id: null,
        course: 3,
        group_code: 'ФЕП-33с',
        group_name: 'ФЕП-33с',
        last_synced_at: null,
        content_hash: null,
        schedule_source_type: null,
        covered_from: null,
        covered_to: null,
      },
      {
        id: 'lnu:ФЕІ-31',
        university_id: 'lnu',
        faculty_id: null,
        course: 3,
        group_code: 'ФЕІ-31',
        group_name: 'ФЕІ-31',
        last_synced_at: null,
        content_hash: null,
        schedule_source_type: null,
        covered_from: null,
        covered_to: null,
      },
      {
        id: 'lnu:ІНА-21',
        university_id: 'lnu',
        faculty_id: '1005', // Simulates contaminated pre-v4.1.1 DB row!
        course: 2,
        group_code: 'ІНА-21',
        group_name: 'ІНА-21',
        last_synced_at: null,
        content_hash: null,
        schedule_source_type: null,
        covered_from: null,
        covered_to: null,
      },
      {
        id: 'lnu:НЕВІД-11',
        university_id: 'lnu',
        faculty_id: null,
        course: 1,
        group_code: 'НЕВІД-11',
        group_name: 'НЕВІД-11',
        last_synced_at: null,
        content_hash: null,
        schedule_source_type: null,
        covered_from: null,
        covered_to: null,
      },
    ]);

    // 1. Electronics (1005) excludes ІНА-21 (even if DB was contaminated!) and excludes unknown НЕВІД-11
    const res1005 = await handleGetGroups(
      'lnu',
      new URL('https://api.test/api/universities/lnu/groups?facultyId=1005'),
      env,
      {}
    );
    assert.equal(res1005.status, 200);
    const data1005 = (await res1005.json()) as { groups: Array<{ id: string; facultyId?: string }> };
    assert.deepEqual(
      data1005.groups.map((g) => g.id).sort(),
      ['ФЕІ-31', 'ФЕП-33с']
    );

    // 2. Specialty filter (lnu-1005-se) returns only ФЕП-33с
    const resProg = await handleGetGroups(
      'lnu',
      new URL('https://api.test/api/universities/lnu/groups?facultyId=1005&programId=lnu-1005-se'),
      env,
      {}
    );
    const dataProg = (await resProg.json()) as { groups: Array<{ id: string }> };
    assert.deepEqual(dataProg.groups.map((g) => g.id), ['ФЕП-33с']);

    // 3. Foreign Languages (1007) returns only ІНА-21 and excludes ФЕП-33с
    const res1007 = await handleGetGroups(
      'lnu',
      new URL('https://api.test/api/universities/lnu/groups?facultyId=1007'),
      env,
      {}
    );
    const data1007 = (await res1007.json()) as { groups: Array<{ id: string }> };
    assert.deepEqual(data1007.groups.map((g) => g.id), ['ІНА-21']);

    // 4. Explicit global search (includeAll=1) returns all groups including unverified
    const resAll = await handleGetGroups(
      'lnu',
      new URL('https://api.test/api/universities/lnu/groups?includeAll=1'),
      env,
      {}
    );
    const dataAll = (await resAll.json()) as { groups: Array<{ id: string }> };
    assert.equal(dataAll.groups.length, 4);
  });

  it('rejects contradictory faculty/group schedule requests and blocks incompatible cache', async () => {
    const nowIso = new Date().toISOString();
    const { env } = createMockD1(
      [
        {
          id: 'lnu:ФЕП-33с',
          university_id: 'lnu',
          faculty_id: '1005',
          course: 3,
          group_code: 'ФЕП-33с',
          group_name: 'ФЕП-33с',
          last_synced_at: nowIso,
          content_hash: 'abc',
          schedule_source_type: 'dated',
          covered_from: '2026-11-23',
          covered_to: '2026-12-06',
        },
      ],
      {
        'lnu:ФЕП-33с': [
          {
            lesson_id: 'l1',
            lesson_date: '2026-11-25',
            day_of_week: 3,
            pair_number: 1,
            start_time: '08:30',
            end_time: '09:50',
            subject: 'Професійний Python',
            lesson_type: 'Л',
            teacher: null,
            room: null,
            building: null,
            subgroup: null,
            is_elective: 0,
            status: 'active',
            updated_at: nowIso,
          },
        ],
      }
    );

    // Contradictory faculty 1007 for ФЕП-33с must be rejected with 400 ACADEMIC_MISMATCH
    const badRes = await handleGetSchedule(
      new URL('https://api.test/api/schedule?universityId=lnu&group=ФЕП-33с&facultyId=1007'),
      env,
      {}
    );
    assert.equal(badRes.status, 400);
    const badBody = (await badRes.json()) as { error: { code: string } };
    assert.equal(badBody.error.code, 'ACADEMIC_MISMATCH');

    // Valid faculty 1005 returns cached schedule with verified facultyId '1005'
    const okRes = await handleGetSchedule(
      new URL('https://api.test/api/schedule?universityId=lnu&group=ФЕП-33с&facultyId=1005'),
      env,
      {}
    );
    assert.equal(okRes.status, 200);
    const okBody = (await okRes.json()) as { schedule: NormalizedSchedule; cacheHit: boolean };
    assert.equal(okBody.cacheHit, true);
    assert.equal(okBody.schedule.facultyId, '1005');
    assert.equal(okBody.schedule.groupId, 'ФЕП-33с');
  });
});
