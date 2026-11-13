import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SEMESTER_START_DATE,
  formatIsoDate,
  getWeekDates,
  getWeekParity,
  parseIsoDate,
} from '../../src/utils/date';
import {
  buildWeekGrid,
  filterLessons,
  getDayLessons,
  lessonsMap,
  scheduleData,
} from '../../src/utils/schedule';
import {
  computeAttendanceSummary,
  computeAttendanceTarget,
  computeWeeklyTrends,
  filterRecordsBySettings,
} from '../../src/utils/attendanceMath';
import {
  BACKUP_APP_VERSION,
  BACKUP_SCHEMA_VERSION,
  buildBackupPayload,
  mergeBackups,
  parseAndValidateBackup,
} from '../../src/utils/backup';
import type { AttendanceRecord, Lesson, UserSettings } from '../../src/types';
import type { UniScheduleBackupData } from '../../src/types/backup';

const BASE_SETTINGS: UserSettings = {
  subgroup: 1,
  department: 'sp',
  electiveCourse: 'freelance',
  theme: 'dark',
  attendanceGoal: 80,
  showWeekends: false,
  semesterStartDate: '2026-09-01',
  desktopScheduleMode: 'week',
};

describe('utils/date', () => {
  it('formatIsoDate formats local calendar date with zero-padding', () => {
    assert.equal(formatIsoDate(new Date(2026, 8, 1)), '2026-09-01');
    assert.equal(formatIsoDate(new Date(2026, 0, 9)), '2026-01-09');
    assert.equal(formatIsoDate(new Date(2026, 11, 31)), '2026-12-31');
  });

  it('parseIsoDate parses valid YYYY-MM-DD dates and trims whitespace', () => {
    const parsed = parseIsoDate(' 2026-09-01 ');
    assert.ok(parsed instanceof Date);
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 8);
    assert.equal(parsed.getDate(), 1);
    assert.equal(parsed.getHours(), 0);
    assert.equal(parsed.getMinutes(), 0);

    const leapDay = parseIsoDate('2024-02-29');
    assert.ok(leapDay instanceof Date);
    assert.equal(formatIsoDate(leapDay), '2024-02-29');
  });

  it('parseIsoDate rejects malformed strings and impossible calendar dates', () => {
    assert.equal(parseIsoDate(''), null);
    assert.equal(parseIsoDate('2026-9-1'), null);
    assert.equal(parseIsoDate('01.09.2026'), null);
    assert.equal(parseIsoDate('2026-02-29'), null); // 2026 is not leap year
    assert.equal(parseIsoDate('2026-02-30'), null);
    assert.equal(parseIsoDate('2026-04-31'), null);
    assert.equal(parseIsoDate('2026-13-01'), null);
  });

  it('getWeekDates returns 5 Mon-Fri or 7 Mon-Sun dates for any anchor in the week', () => {
    // Sunday 2026-09-06 belongs to the ISO week starting Monday 2026-08-31
    const sunday = new Date(2026, 8, 6);
    const fiveDays = getWeekDates(sunday, false).map(formatIsoDate);
    assert.deepEqual(fiveDays, [
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);

    const sevenDays = getWeekDates(new Date(2026, 8, 2), true).map(formatIsoDate);
    assert.deepEqual(sevenDays, [
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });

  it('getWeekParity alternates numerator and denominator cleanly across weeks and DST', () => {
    const semStart = DEFAULT_SEMESTER_START_DATE; // 2026-09-01 (week starting 2026-08-31)
    assert.equal(getWeekParity(new Date(2026, 7, 31), semStart), 'numerator');
    assert.equal(getWeekParity(new Date(2026, 8, 1), semStart), 'numerator');
    assert.equal(getWeekParity(new Date(2026, 8, 6), semStart), 'numerator');

    // Next week -> denominator
    assert.equal(getWeekParity(new Date(2026, 8, 7), semStart), 'denominator');
    assert.equal(getWeekParity(new Date(2026, 8, 13), semStart), 'denominator');

    // Week 3 -> numerator
    assert.equal(getWeekParity(new Date(2026, 8, 14), semStart), 'numerator');

    // Prior week -> denominator (negative week offset normalized)
    assert.equal(getWeekParity(new Date(2026, 7, 24), semStart), 'denominator');

    // Across European DST switch (2026-10-25): consecutive Mondays must flip parity
    const beforeDst = getWeekParity(new Date(2026, 9, 19), semStart);
    const afterDst = getWeekParity(new Date(2026, 9, 26), semStart);
    assert.notEqual(beforeDst, afterDst);

    // Invalid semesterStartDate falls back safely
    assert.equal(getWeekParity(new Date(2026, 8, 1), 'invalid-date'), 'numerator');
  });
});

describe('utils/schedule', () => {
  it('filterLessons filters by department (sp, oit, rks, rkt)', () => {
    const wedLessons = getDayLessons(3, scheduleData);
    const friLessons = getDayLessons(5, scheduleData);

    const wedSp = filterLessons(wedLessons, { subgroup: 1, department: 'sp', electiveCourse: 'freelance' });
    const wedOit = filterLessons(wedLessons, { subgroup: 1, department: 'oit', electiveCourse: 'freelance' });
    const wedRks = filterLessons(wedLessons, { subgroup: 1, department: 'rks', electiveCourse: 'freelance' });
    const wedRkt = filterLessons(wedLessons, { subgroup: 1, department: 'rkt', electiveCourse: 'freelance' });

    assert.equal(wedSp.some((l) => l.id === 'wed_7_c_lab'), false);
    assert.equal(wedOit.some((l) => l.id === 'wed_7_c_lab'), false);
    assert.equal(wedRks.some((l) => l.id === 'wed_7_c_lab'), true);
    assert.equal(wedRkt.some((l) => l.id === 'wed_7_c_lab'), true);

    const friSp = filterLessons(friLessons, { subgroup: 1, department: 'sp', electiveCourse: 'freelance' });
    const friOit = filterLessons(friLessons, { subgroup: 1, department: 'oit', electiveCourse: 'freelance' });
    const friRks = filterLessons(friLessons, { subgroup: 1, department: 'rks', electiveCourse: 'freelance' });
    const friRkt = filterLessons(friLessons, { subgroup: 1, department: 'rkt', electiveCourse: 'freelance' });

    assert.equal(friSp.some((l) => l.id === 'fri_2_nosql_lab'), true);
    assert.equal(friOit.some((l) => l.id === 'fri_4_nosql_lec'), true);
    assert.equal(friRks.some((l) => l.id === 'fri_2_nosql_lab'), false);
    assert.equal(friRkt.some((l) => l.id === 'fri_4_nosql_lec'), false);
  });

  it('filterLessons filters by subgroup 1 vs 2', () => {
    const tueLessons = getDayLessons(2, scheduleData);
    const sub1 = filterLessons(tueLessons, { subgroup: 1, department: 'sp', electiveCourse: 'freelance' });
    const sub2 = filterLessons(tueLessons, { subgroup: 2, department: 'sp', electiveCourse: 'freelance' });

    assert.equal(sub1.some((l) => l.id === 'tue_1_soft_1'), true);
    assert.equal(sub1.some((l) => l.id === 'tue_1_comp_2'), false);
    assert.equal(sub2.some((l) => l.id === 'tue_1_comp_2'), true);
    assert.equal(sub2.some((l) => l.id === 'tue_1_soft_1'), false);
  });

  it('filterLessons filters electives (freelance, management, space, both)', () => {
    const monLessons = getDayLessons(1, scheduleData);

    const freelanceIds = filterLessons(monLessons, { subgroup: 1, department: 'sp', electiveCourse: 'freelance' }).map((l) => l.id);
    assert.deepEqual(freelanceIds, ['mon_3_freelance_lec', 'mon_4_freelance_pr', 'mon_5_eng_data']);

    const mgmtIds = filterLessons(monLessons, { subgroup: 1, department: 'sp', electiveCourse: 'management' }).map((l) => l.id);
    assert.deepEqual(mgmtIds, ['mon_4_innov_lec', 'mon_5_eng_data']);

    const spaceIds = filterLessons(monLessons, { subgroup: 1, department: 'sp', electiveCourse: 'space' }).map((l) => l.id);
    assert.deepEqual(spaceIds, ['mon_4_space_lec', 'mon_5_eng_data']);

    const bothIds = filterLessons(monLessons, { subgroup: 1, department: 'sp', electiveCourse: 'both' }).map((l) => l.id);
    assert.equal(bothIds.length, 5);
  });

  it('filterLessons filters by weekParity and sorts by order then startTime', () => {
    const synthetic: Lesson[] = [
      {
        id: 'l_denom',
        order: 2,
        startTime: '10:10',
        endTime: '11:30',
        name: 'Denom',
        type: 'Лекція',
        teacherId: 't_1',
        classroomId: 'c_1',
        weekType: 'denominator',
      },
      {
        id: 'l_num',
        order: 2,
        startTime: '10:10',
        endTime: '11:30',
        name: 'Num',
        type: 'Лекція',
        teacherId: 't_1',
        classroomId: 'c_1',
        weekType: 'numerator',
      },
      {
        id: 'l_both',
        order: 1,
        startTime: '08:30',
        endTime: '09:50',
        name: 'Both',
        type: 'Практична',
        teacherId: 't_1',
        classroomId: 'c_1',
        weekType: 'both',
      },
    ];

    const num = filterLessons(synthetic, BASE_SETTINGS, 'numerator');
    assert.deepEqual(num.map((l) => l.id), ['l_both', 'l_num']);

    const denom = filterLessons(synthetic, BASE_SETTINGS, 'denominator');
    assert.deepEqual(denom.map((l) => l.id), ['l_both', 'l_denom']);

    const all = filterLessons(synthetic, BASE_SETTINGS);
    assert.equal(all.length, 3);
  });

  it('buildWeekGrid builds columns, slots, and activeSlotOrders per profile', () => {
    const weekDates = getWeekDates(new Date(2026, 8, 7), false);

    // SP + subgroup 1 has no Thursday lessons and no slot 7 lessons
    const spGrid = buildWeekGrid(
      scheduleData,
      { subgroup: 1, department: 'sp', electiveCourse: 'freelance' },
      weekDates,
      'denominator'
    );
    assert.equal(spGrid.days.length, 5);
    assert.equal(spGrid.slots.length, 8);
    assert.deepEqual(spGrid.activeSlotOrders, [1, 2, 3, 4, 5, 6, 8]);
    assert.equal(spGrid.days[3].lessons.length, 0); // Thursday empty for SP
    assert.equal(spGrid.days[0].isoDate, '2026-09-07');
    assert.equal(spGrid.days[0].lessonsByOrder[3]?.[0]?.id, 'mon_3_freelance_lec');

    // RKS + subgroup 1 has slot 7 on Wed and slot 5 on Thu
    const rksGrid = buildWeekGrid(
      scheduleData,
      { subgroup: 1, department: 'rks', electiveCourse: 'freelance' },
      weekDates,
      'denominator'
    );
    assert.equal(rksGrid.activeSlotOrders.includes(7), true);
    assert.equal(rksGrid.days[3].lessonsByOrder[5]?.[0]?.id, 'thu_5_c_lec');
  });
});

describe('utils/attendanceMath', () => {
  it('computeAttendanceSummary returns hasData: false and percentage: null when empty', () => {
    assert.deepEqual(computeAttendanceSummary([]), {
      totalMarked: 0,
      present: 0,
      absent: 0,
      excused: 0,
      attended: 0,
      percentage: null,
      hasData: false,
    });
  });

  it('computeAttendanceSummary aggregates present, excused, absent correctly', () => {
    const records: AttendanceRecord[] = [
      { lessonId: 'mon_5_eng_data', date: '2026-09-07', status: 'present' },
      { lessonId: 'tue_4_soft_lec', date: '2026-09-08', status: 'excused' },
      { lessonId: 'wed_5_comp_lec', date: '2026-09-09', status: 'absent' },
    ];
    const summary = computeAttendanceSummary(records);
    assert.equal(summary.totalMarked, 3);
    assert.equal(summary.present, 1);
    assert.equal(summary.excused, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.attended, 2);
    assert.equal(summary.percentage, 67);
    assert.equal(summary.hasData, true);
  });

  it('computeAttendanceTarget handles empty, canSkip, mustAttend, and 100% unreachable edge case', () => {
    const empty = computeAttendanceTarget(0, 0, 80);
    assert.equal(empty.hasData, false);
    assert.equal(empty.currentPercent, null);
    assert.equal(empty.canSkip, 0);
    assert.equal(empty.mustAttend, 0);

    // 9 / 10 = 90%, goal 80% -> can skip 1 (9/11 = 81.8% >= 80%, 9/12 = 75% < 80%)
    const ahead = computeAttendanceTarget(9, 10, 80);
    assert.equal(ahead.isMeetingGoal, true);
    assert.equal(ahead.isGoalReachable, true);
    assert.equal(ahead.canSkip, 1);
    assert.equal(ahead.mustAttend, 0);

    // 8 / 10 = 80%, goal 80% -> exact threshold, canSkip 0
    const exact = computeAttendanceTarget(8, 10, 80);
    assert.equal(exact.isMeetingGoal, true);
    assert.equal(exact.canSkip, 0);

    // 6 / 10 = 60%, goal 80% -> mustAttend 10 ((6+10)/(10+10) = 80%)
    const behind = computeAttendanceTarget(6, 10, 80);
    assert.equal(behind.isMeetingGoal, false);
    assert.equal(behind.isGoalReachable, true);
    assert.equal(behind.canSkip, 0);
    assert.equal(behind.mustAttend, 10);

    // 9 / 10 = 90%, goal 100% -> unreachable
    const unreachable100 = computeAttendanceTarget(9, 10, 100);
    assert.equal(unreachable100.hasData, true);
    assert.equal(unreachable100.isMeetingGoal, false);
    assert.equal(unreachable100.isGoalReachable, false);
    assert.equal(unreachable100.canSkip, 0);
    assert.equal(unreachable100.mustAttend, null);

    // 5 / 5 = 100%, goal 100% -> meeting goal, canSkip 0
    const perfect100 = computeAttendanceTarget(5, 5, 100);
    assert.equal(perfect100.isMeetingGoal, true);
    assert.equal(perfect100.isGoalReachable, true);
    assert.equal(perfect100.canSkip, 0);
  });

  it('computeWeeklyTrends groups by ISO week, sorts ascending, and limits to maxWeeks', () => {
    const records: AttendanceRecord[] = [
      { lessonId: 'mon_5_eng_data', date: '2026-09-07', status: 'present' },
      { lessonId: 'tue_4_soft_lec', date: '2026-09-08', status: 'absent' },
      { lessonId: 'mon_5_eng_data', date: '2026-09-14', status: 'present' },
      { lessonId: 'mon_5_eng_data', date: '2026-09-21', status: 'excused' },
      { lessonId: 'mon_5_eng_data', date: 'invalid-date', status: 'present' },
    ];

    const trends = computeWeeklyTrends(records, 2);
    assert.equal(trends.length, 2);
    assert.equal(trends[0].weekStartIso, '2026-09-14');
    assert.equal(trends[0].weekEndIso, '2026-09-18');
    assert.equal(trends[0].percentage, 100);
    assert.equal(trends[1].weekStartIso, '2026-09-21');
    assert.equal(trends[1].excused, 1);
    assert.equal(trends[1].percentage, 100);
  });

  it('filterRecordsBySettings filters out other departments, subgroups, electives, and unknown IDs', () => {
    const records: AttendanceRecord[] = [
      { lessonId: 'mon_5_eng_data', date: '2026-09-07', status: 'present' }, // all
      { lessonId: 'tue_1_soft_1', date: '2026-09-08', status: 'present' },   // subgroup 1
      { lessonId: 'tue_1_comp_2', date: '2026-09-08', status: 'absent' },    // subgroup 2
      { lessonId: 'wed_7_c_lab', date: '2026-09-09', status: 'present' },    // rks/rkt only
      { lessonId: 'mon_4_space_lec', date: '2026-09-07', status: 'present' },// elective space
      { lessonId: 'nonexistent', date: '2026-09-07', status: 'present' },
    ];

    const filtered = filterRecordsBySettings(
      records,
      { subgroup: 1, department: 'sp', electiveCourse: 'freelance' },
      lessonsMap
    );

    assert.deepEqual(
      filtered.map((r) => r.lessonId),
      ['mon_5_eng_data', 'tue_1_soft_1']
    );
  });
});

describe('utils/backup', () => {
  const sampleData: UniScheduleBackupData = {
    attendance: [
      { lessonId: 'mon_5_eng_data', date: '2026-09-07', status: 'present' },
    ],
    settings: { ...BASE_SETTINGS },
    notes: [
      {
        id: 'note-1',
        lessonId: 'mon_5_eng_data',
        date: '2026-09-07',
        content: 'Initial note',
        updatedAt: '2026-09-07T10:00:00.000Z',
      },
    ],
    deadlines: [
      {
        id: 'dl-1',
        title: 'Lab 1',
        dueDate: '2026-09-15',
        priority: 'high',
        completed: false,
        createdAt: '2026-09-07T09:00:00.000Z',
        updatedAt: '2026-09-07T09:00:00.000Z',
      },
    ],
  };

  it('buildBackupPayload creates valid v2 payload and parseAndValidateBackup accepts it', () => {
    const payload = buildBackupPayload(sampleData);
    assert.equal(payload.schemaVersion, BACKUP_SCHEMA_VERSION);
    assert.equal(payload.appVersion, BACKUP_APP_VERSION);
    assert.ok(Date.parse(payload.exportedAt) > 0);

    const result = parseAndValidateBackup(JSON.stringify(payload));
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.format, 'v2');
      assert.equal(result.isPartialAttendanceOnly, false);
      assert.deepEqual(result.counts, {
        attendance: 1,
        notes: 1,
        deadlines: 1,
        hasSettings: true,
      });
      assert.equal(result.backup.data.notes[0].content, 'Initial note');
    }
  });

  it('parseAndValidateBackup supports legacy AttendanceRecord[] v1 array', () => {
    const legacy: AttendanceRecord[] = [
      { lessonId: 'mon_5_eng_data', date: '2026-09-07', status: 'excused' },
      { lessonId: 'tue_4_soft_lec', date: '2026-09-08', status: 'present' },
    ];
    const result = parseAndValidateBackup(JSON.stringify(legacy));
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.format, 'legacy_attendance_v1');
      assert.equal(result.isPartialAttendanceOnly, true);
      assert.equal(result.counts.attendance, 2);
      assert.equal(result.counts.hasSettings, false);
      assert.ok(result.warnings.length > 0);
    }
  });

  it('parseAndValidateBackup rejects invalid JSON, future schemaVersion > 2, and malformed entries', () => {
    const invalidJson = parseAndValidateBackup('{not valid json');
    assert.equal(invalidJson.valid, false);

    const future = parseAndValidateBackup(
      JSON.stringify({ schemaVersion: 3, data: sampleData })
    );
    assert.equal(future.valid, false);
    if (!future.valid) {
      assert.match(future.error, /v3/);
    }

    const oldSchema = parseAndValidateBackup(
      JSON.stringify({ schemaVersion: 1, data: sampleData })
    );
    assert.equal(oldSchema.valid, false);

    const badDeadline = parseAndValidateBackup(
      JSON.stringify({
        schemaVersion: 2,
        data: {
          ...sampleData,
          deadlines: [{ id: 'd1', title: 'Bad', dueDate: '2026-02-30', priority: 'high', completed: false, createdAt: '2026-09-01T00:00:00Z' }],
        },
      })
    );
    assert.equal(badDeadline.valid, false);
  });

  it('mergeBackups deduplicates attendance by (lessonId, date) and notes/deadlines by newer timestamp', () => {
    const incoming: UniScheduleBackupData = {
      attendance: [
        // Collision on (mon_5_eng_data, 2026-09-07): incoming wins ('absent')
        { lessonId: 'mon_5_eng_data', date: '2026-09-07', status: 'absent' },
        { lessonId: 'wed_5_comp_lec', date: '2026-09-09', status: 'present' },
      ],
      settings: { ...BASE_SETTINGS, department: 'oit', subgroup: 2 },
      notes: [
        // Collision on note-1: incoming is OLDER so current should win
        {
          id: 'note-1',
          lessonId: 'mon_5_eng_data',
          date: '2026-09-07',
          content: 'Stale incoming note',
          updatedAt: '2026-09-07T08:00:00.000Z',
        },
        {
          id: 'note-2',
          lessonId: 'wed_5_comp_lec',
          content: 'New incoming note',
          updatedAt: '2026-09-09T12:00:00.000Z',
        },
      ],
      deadlines: [
        // Collision on dl-1: incoming is NEWER so incoming wins
        {
          id: 'dl-1',
          title: 'Lab 1 Updated',
          dueDate: '2026-09-16',
          priority: 'high',
          completed: true,
          createdAt: '2026-09-07T09:00:00.000Z',
          updatedAt: '2026-09-08T10:00:00.000Z',
        },
      ],
    };

    const merged = mergeBackups(sampleData, incoming, { mergeSettings: true });
    assert.equal(merged.attendance.length, 2);
    assert.equal(
      merged.attendance.find((a) => a.lessonId === 'mon_5_eng_data')?.status,
      'absent'
    );
    assert.equal(merged.notes.length, 2);
    assert.equal(
      merged.notes.find((n) => n.id === 'note-1')?.content,
      'Initial note'
    );
    assert.equal(merged.deadlines.length, 1);
    assert.equal(merged.deadlines[0].title, 'Lab 1 Updated');
    assert.equal(merged.deadlines[0].completed, true);
    assert.equal(merged.settings.department, 'oit');

    const mergedKeepSettings = mergeBackups(sampleData, incoming, { mergeSettings: false });
    assert.equal(mergedKeepSettings.settings.department, 'sp');
  });
});
