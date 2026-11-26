import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseLnuScheduleHtml } from '../../src/integrations/universities/lnu/lnuParser';
import { toAppScheduleBundle } from '../../src/integrations/universities/normalizers/scheduleNormalizer';
import type { NormalizedSchedule, ScheduleLesson } from '../../src/integrations/universities/types';
import { normalizeSettings } from '../../src/hooks/useSettings';
import { profileSignature } from '../../src/services/profileSyncQueue';
import { buildBackupPayload, parseAndValidateBackup } from '../../src/utils/backup';
import {
  computeParallelDimensionKey,
  computeParallelOptionKey,
  computeParallelVariantKey,
  detectParallelGroupDimensions,
  matchesParallelGroupSelection,
  normalizeSelectedParallelGroups,
  parseParallelSubject,
  resolveActiveParallelSelections,
} from '../../src/utils/parallelGroups';
import { buildWeekGrid, filterLessons } from '../../src/utils/schedule';
import { getWeekDates, parseIsoDate } from '../../src/utils/date';

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'tests/fixtures/lnu-ina35s-2026-11-26-live.html'
);

function loadIna35Schedule(): NormalizedSchedule {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf-8');
  return parseLnuScheduleHtml(
    html,
    { groupId: 'ІНА-35с', groupName: 'ІНА-35с', facultyId: '1007', course: 3 },
    { coveredFrom: '2026-11-23', coveredTo: '2026-12-06' }
  );
}

test('parseParallelSubject splits parenthetical language variants cleanly', () => {
  assert.deepEqual(parseParallelSubject('Друга іноземна мова (німецька)'), {
    baseSubject: 'Друга іноземна мова',
    variantLabel: 'Німецька',
  });
  assert.deepEqual(parseParallelSubject('Перша іноземна мова'), {
    baseSubject: 'Перша іноземна мова',
  });
});

test('ІНА-35с official fixture: detects First & Second Foreign Language parallel dimensions automatically', () => {
  const schedule = loadIna35Schedule();
  assert.equal(schedule.lessons.length, 172);

  const dims = detectParallelGroupDimensions(schedule.lessons, {
    universityId: 'lnu',
    groupId: 'ІНА-35с',
  });
  assert.equal(dims.length, 2, 'Should detect exactly 2 parallel dimensions for ІНА-35с');

  const labels = dims.map((d) => d.label);
  assert.deepEqual(labels, ['Друга іноземна мова', 'Перша іноземна мова']);

  const secondLang = dims.find((d) => d.label === 'Друга іноземна мова')!;
  assert.equal(secondLang.hasVariants, true);
  // Has variant-level options (Іспанська, Німецька, Французька) + concrete teacher options
  const variantOptions = secondLang.options.filter((o) => o.isVariantGroup);
  assert.equal(variantOptions.length, 3);
  const concreteSecond = secondLang.options.filter((o) => !o.isVariantGroup);
  assert.ok(concreteSecond.length >= 9, `Expected >= 9 teacher subgroups, got ${concreteSecond.length}`);

  const firstLang = dims.find((d) => d.label === 'Перша іноземна мова')!;
  assert.equal(firstLang.hasVariants, false);
  assert.ok(firstLang.options.length >= 10, `Expected >= 10 teacher subgroups, got ${firstLang.options.length}`);
});

test('ІНА-35с official fixture: Day View & Week View drop from 23 overlapping Monday blocks to clean personalized timetable', () => {
  const schedule = loadIna35Schedule();
  const bundle = toAppScheduleBundle(schedule);
  const mondayLessons = bundle.datedLessonsByIso['2026-11-23'] ?? [];
  assert.equal(mondayLessons.length, 23, 'Raw Monday should have 23 parsed blocks');

  // Unconfigured fallback: never silently hides required parallel lessons
  const unconfigured = filterLessons(mondayLessons, {
    subgroup: 1,
    department: 'sp',
    electiveCourse: 'freelance',
    selectedElectives: [],
  });
  // 23 total minus DVVS electives (which are hidden until selected)
  const rawNonElectiveMonday = mondayLessons.filter((l) => !l.isElective);
  assert.equal(unconfigured.length, rawNonElectiveMonday.length);

  // Select specific 1st language teacher + 2nd language (German) teacher
  const dims = detectParallelGroupDimensions(schedule.lessons, {
    universityId: 'lnu',
    groupId: 'ІНА-35с',
  });
  const firstDim = dims.find((d) => d.label === 'Перша іноземна мова')!;
  const secondDim = dims.find((d) => d.label === 'Друга іноземна мова')!;
  const germanTeacherOpt = secondDim.options.find(
    (o) => !o.isVariantGroup && o.badge === 'Німецька'
  )!;
  const firstTeacherOpt = firstDim.options[0]!;
  assert.ok(germanTeacherOpt);
  assert.ok(firstTeacherOpt);

  const selectedParallelGroups = {
    [firstDim.key]: firstTeacherOpt.key,
    [secondDim.key]: germanTeacherOpt.key,
  };

  const personalizedMonday = filterLessons(mondayLessons, {
    subgroup: 1,
    department: 'sp',
    electiveCourse: 'freelance',
    selectedElectives: [],
    selectedParallelGroups,
  });

  // Verify no Spanish or French lessons leak into Monday
  assert.equal(
    personalizedMonday.some((l) => /іспанськ|французьк/i.test(l.name)),
    false,
    'Unselected second languages must not appear'
  );
  // Verify at most 1 lesson per slot for each parallel language on Monday
  const slotsCount = new Map<number, number>();
  for (const l of personalizedMonday) {
    slotsCount.set(l.order, (slotsCount.get(l.order) ?? 0) + 1);
  }
  for (const [slot, count] of slotsCount.entries()) {
    assert.equal(count, 1, `Expected 1 lesson in slot ${slot}, got ${count}`);
  }
  assert.ok(
    personalizedMonday.length >= 1 && personalizedMonday.length <= 4,
    `Expected realistic personalized Monday count (1..4), got ${personalizedMonday.length}`
  );

  // Verify general mandatory lessons across the full 2-week window remain intact
  const allFiltered = Object.values(bundle.datedLessonsByIso).flatMap((dayLs) =>
    filterLessons(dayLs, {
      subgroup: 1,
      department: 'sp',
      electiveCourse: 'freelance',
      selectedElectives: [],
      selectedParallelGroups,
    })
  );
  const allNames = new Set(allFiltered.map((l) => l.name));
  for (const mandatory of ['Національна література', 'Філософія', 'Стилістика', 'Історія мови']) {
    assert.ok(allNames.has(mandatory), `Mandatory lesson "${mandatory}" must remain visible`);
  }

  // Verify Week Grid consistency with Day View
  const weekDates = getWeekDates(parseIsoDate('2026-11-23')!, false);
  const grid = buildWeekGrid(
    bundle.schedule,
    {
      subgroup: 1,
      department: 'sp',
      electiveCourse: 'freelance',
      selectedElectives: [],
      selectedParallelGroups,
    },
    weekDates,
    'numerator',
    bundle.datedLessonsByIso
  );
  const mondayCol = grid.days.find((d) => d.isoDate === '2026-11-23')!;
  assert.deepEqual(
    mondayCol.lessons.map((l) => l.id),
    personalizedMonday.map((l) => l.id)
  );
});

test('Variant-level selection (language only) filters out other languages while keeping all teachers of chosen language', () => {
  const schedule = loadIna35Schedule();
  const bundle = toAppScheduleBundle(schedule);
  const mondayLessons = bundle.datedLessonsByIso['2026-11-23'] ?? [];
  const secondDimKey = computeParallelDimensionKey('Друга іноземна мова (німецька)');
  const germanVarKey = computeParallelVariantKey('Друга іноземна мова (німецька)')!;

  const filtered = filterLessons(mondayLessons, {
    subgroup: 1,
    department: 'sp',
    electiveCourse: 'freelance',
    selectedElectives: [],
    selectedParallelGroups: { [secondDimKey]: germanVarKey },
  });
  assert.ok(filtered.some((l) => l.name.includes('німецька')));
  assert.equal(filtered.some((l) => l.name.includes('іспанська')), false);
  assert.equal(filtered.some((l) => l.name.includes('французька')), false);
});

test('Cross-faculty universality: ФЕП-13с parallel "Іноземна мова" is detected without hardcoding ІНА-35с', () => {
  const fep13Lessons: ScheduleLesson[] = [
    {
      id: 'lnu_fep13_1',
      date: '2026-11-24',
      dayOfWeek: 2,
      number: 1,
      startTime: '08:30',
      endTime: '09:50',
      subject: 'Іноземна мова',
      lessonType: 'П',
      teacher: 'доц. Іваненко О.О.',
      group: 'ФЕП-13с',
      groupLabel: 'Збірна група',
      isElective: false,
      universityId: 'lnu',
      updatedAt: '2026-11-26T00:00:00Z',
    },
    {
      id: 'lnu_fep13_2',
      date: '2026-11-24',
      dayOfWeek: 2,
      number: 1,
      startTime: '08:30',
      endTime: '09:50',
      subject: 'Іноземна мова',
      lessonType: 'П',
      teacher: 'ас. Петренко М.М.',
      group: 'ФЕП-13с',
      groupLabel: 'Збірна група',
      isElective: false,
      universityId: 'lnu',
      updatedAt: '2026-11-26T00:00:00Z',
    },
    {
      id: 'lnu_fep13_3',
      date: '2026-11-24',
      dayOfWeek: 2,
      number: 2,
      startTime: '10:10',
      endTime: '11:30',
      subject: 'Вища математика',
      lessonType: 'Л',
      teacher: 'проф. Сидоренко В.В.',
      group: 'ФЕП-13с',
      isElective: false,
      universityId: 'lnu',
      updatedAt: '2026-11-26T00:00:00Z',
    },
  ];

  const dims = detectParallelGroupDimensions(fep13Lessons, {
    universityId: 'lnu',
    groupId: 'ФЕП-13с',
  });
  assert.equal(dims.length, 1);
  assert.equal(dims[0]!.label, 'Іноземна мова');
  assert.equal(dims[0]!.options.length, 2);
});

test('Regression guard: ФЕП-33с numeric subgroups and department rules produce zero spurious parallel dimensions', () => {
  const fep33Lessons: ScheduleLesson[] = [
    {
      id: 'lnu_fep33_s1',
      date: '2026-11-24',
      dayOfWeek: 2,
      number: 1,
      startTime: '08:30',
      endTime: '09:50',
      subject: 'Бази даних',
      lessonType: 'Лаб',
      teacher: 'доц. А',
      group: 'ФЕП-33с',
      subgroup: 1,
      isElective: false,
      universityId: 'lnu',
      updatedAt: '2026-11-26T00:00:00Z',
    },
    {
      id: 'lnu_fep33_s2',
      date: '2026-11-24',
      dayOfWeek: 2,
      number: 1,
      startTime: '08:30',
      endTime: '09:50',
      subject: 'Бази даних',
      lessonType: 'Лаб',
      teacher: 'доц. Б',
      group: 'ФЕП-33с',
      subgroup: 2,
      isElective: false,
      universityId: 'lnu',
      updatedAt: '2026-11-26T00:00:00Z',
    },
  ];

  const dims = detectParallelGroupDimensions(fep33Lessons, {
    universityId: 'lnu',
    groupId: 'ФЕП-33с',
  });
  assert.equal(dims.length, 0);
});

test('Safe deduplication: removes exact duplicates while preserving distinct parallel teachers', () => {
  const html = `
    <html><body>
      <h4>23.11.2026 Понеділок</h4>
      <table>
        <tr>
          <td>1</td><td>08:30<br>09:50</td>
          <td>
            <span class="p_name">Перша іноземна мова</span>
            <span class="p_type_name">П</span>
            <span class="t_name">доц. Альфа А.А.</span>
            <span class="gr2_name">Збірна група</span>
            <span class="p_name">Перша іноземна мова</span>
            <span class="p_type_name">П</span>
            <span class="t_name">доц. Альфа А.А.</span>
            <span class="gr2_name">Збірна група</span>
            <span class="p_name">Перша іноземна мова</span>
            <span class="p_type_name">П</span>
            <span class="t_name">доц. Бета Б.Б.</span>
            <span class="gr2_name">Збірна група</span>
          </td>
        </tr>
      </table>
    </body></html>
  `;
  const parsed = parseLnuScheduleHtml(
    html,
    { groupId: 'ІНА-35с', groupName: 'ІНА-35с', facultyId: '1007' },
    { coveredFrom: '2026-11-23', coveredTo: '2026-11-29' }
  );
  assert.equal(parsed.lessons.length, 2, 'Exact duplicate removed, distinct parallel teacher preserved');
  assert.notEqual(parsed.lessons[0]!.id, parsed.lessons[1]!.id);
});

test('Settings normalization, profileSignature, backup export/import, and Push matcher handle selectedParallelGroups', () => {
  const dimKey = computeParallelDimensionKey('Перша іноземна мова');
  const optA = computeParallelOptionKey('Перша іноземна мова', 'доц. Альфа А.А.');
  const optB = computeParallelOptionKey('Перша іноземна мова', 'доц. Бета Б.Б.');

  const sanitized = normalizeSelectedParallelGroups({
    [dimKey]: optA,
    bad_key: 'opt_123',
    pg_badval: 'invalid_val',
  });
  assert.deepEqual(sanitized, { [dimKey]: optA });

  const s1 = normalizeSettings({
    scheduleSourceMode: 'live',
    universityProfile: { universityId: 'lnu', groupId: 'ІНА-35с', groupName: 'ІНА-35с' },
    selectedParallelGroups: { [dimKey]: optA },
  });
  const s2 = normalizeSettings({
    scheduleSourceMode: 'live',
    universityProfile: { universityId: 'lnu', groupId: 'ІНА-35с', groupName: 'ІНА-35с' },
    selectedParallelGroups: { [dimKey]: optB },
  });
  assert.notEqual(profileSignature(s1), profileSignature(s2));

  const payload = buildBackupPayload({
    attendance: [],
    settings: s1,
    notes: [],
    deadlines: [],
  });
  const restored = parseAndValidateBackup(JSON.stringify(payload));
  assert.equal(restored.valid, true);
  if (restored.valid) {
    assert.deepEqual(restored.backup.data.settings.selectedParallelGroups, { [dimKey]: optA });
  }

  assert.equal(
    matchesParallelGroupSelection(
      { subject: 'Перша іноземна мова', teacher: 'доц. Альфа А.А.' },
      { [dimKey]: optA }
    ),
    true
  );
  assert.equal(
    matchesParallelGroupSelection(
      { subject: 'Перша іноземна мова', teacher: 'доц. Бета Б.Б.' },
      { [dimKey]: optA }
    ),
    false
  );
  // Mandatory general subject is untouched by foreign-language selection
  assert.equal(
    matchesParallelGroupSelection(
      { subject: 'Філософія', teacher: 'проф. Гамма Г.Г.' },
      { [dimKey]: optA }
    ),
    true
  );
});

test('Conservative safety: never misclassifies ordinary conflicts, shared Потік, mixed Л/П types, or different weeks', () => {
  const mk = (over: Partial<ScheduleLesson>): ScheduleLesson => ({
    id: 'id_' + Math.random(),
    date: '2026-11-23',
    dayOfWeek: 1,
    number: 1,
    startTime: '08:30',
    endTime: '09:50',
    subject: 'Філософія',
    lessonType: 'Л',
    teacher: 'проф. А',
    group: 'TEST-1',
    isElective: false,
    universityId: 'lnu',
    updatedAt: '2026-11-26T00:00:00Z',
    ...over,
  });

  // 1. Two different mandatory subjects in same slot (ordinary conflict)
  assert.equal(
    detectParallelGroupDimensions([
      mk({ subject: 'Філософія', teacher: 'проф. А' }),
      mk({ subject: 'Історія України', teacher: 'проф. Б' }),
    ]).length,
    0
  );

  // 2. Shared flow ("Потік") or unmarked multi-teacher co-teaching of the same subject
  assert.equal(
    detectParallelGroupDimensions([
      mk({ subject: 'Філософія', groupLabel: 'Потік', teacher: 'проф. А' }),
      mk({ subject: 'Філософія', groupLabel: 'Потік', teacher: 'проф. Б' }),
    ]).length,
    0
  );
  assert.equal(
    detectParallelGroupDimensions([
      mk({ subject: 'Філософія', groupLabel: undefined, teacher: 'проф. А' }),
      mk({ subject: 'Філософія', groupLabel: undefined, teacher: 'проф. Б' }),
    ]).length,
    0
  );

  // 3. Different lesson types (Лекція vs Практична) of same subject in same slot
  assert.equal(
    detectParallelGroupDimensions([
      mk({ subject: 'Перша іноземна мова', groupLabel: 'Збірна група', lessonType: 'Л', teacher: 'доц. А' }),
      mk({ subject: 'Перша іноземна мова', groupLabel: 'Збірна група', lessonType: 'П', teacher: 'доц. Б' }),
    ]).length,
    0
  );

  // 4. Different week parities (numerator vs denominator)
  assert.equal(
    detectParallelGroupDimensions([
      mk({ date: undefined, weekType: 'numerator', subject: 'Іноземна мова', groupLabel: 'Збірна група', lessonType: 'П', teacher: 'доц. А' }),
      mk({ date: undefined, weekType: 'denominator', subject: 'Іноземна мова', groupLabel: 'Збірна група', lessonType: 'П', teacher: 'доц. Б' }),
    ]).length,
    0
  );
});

test('Identity stability & stale-teacher protection: replaced teacher never silently hides lessons', () => {
  // Stable hashes invariant to room, time, date, order
  const dim1 = computeParallelDimensionKey('Друга іноземна мова (німецька)');
  const dim2 = computeParallelDimensionKey('  Друга  іноземна мова (німецька) ');
  assert.equal(dim1, dim2);
  assert.equal(
    computeParallelOptionKey('Друга іноземна мова (німецька)', 'доц. Захаров Ю.М.'),
    computeParallelOptionKey('Друга іноземна мова (німецька)', '  доц. Захаров Ю.М. ')
  );

  const schedule = loadIna35Schedule();
  const dims = detectParallelGroupDimensions(schedule.lessons, {
    universityId: 'lnu',
    groupId: 'ІНА-35с',
  });
  const secondDim = dims.find((d) => d.label === 'Друга іноземна мова')!;
  const germanVar = secondDim.options.find((o) => o.isVariantGroup && o.label.includes('Німецька'))!;

  // Case A: Stale/replaced teacher -> omitted from effectiveSelections and flagged in staleDimensions
  const staleState = resolveActiveParallelSelections(dims, {
    [secondDim.key]: 'opt_nonexistent_replaced_teacher',
  });
  assert.equal(staleState.effectiveSelections, undefined);
  assert.equal(staleState.staleDimensions.length, 1);
  assert.equal(staleState.staleDimensions[0]!.key, secondDim.key);

  // Case B: Language-only ("усі викладачі") -> flagged as partialDimensions (not fully personalized)
  const partialState = resolveActiveParallelSelections(dims, {
    [secondDim.key]: germanVar.key,
  });
  assert.deepEqual(partialState.effectiveSelections, { [secondDim.key]: germanVar.key });
  assert.equal(partialState.partialDimensions.length, 1);
  assert.equal(partialState.partialDimensions[0]!.key, secondDim.key);

  // Case C: Partial single-slot teacher replacement (teacher A remains on Tuesday, replaced by B on Monday)
  // -> filtered Monday has 0 lessons, while unfiltered parallel lessons retain B so UI reveals hidden count + 1-tap toggle.
  const partialReplaceSchedule: NormalizedSchedule = {
    universityId: 'lnu',
    universityName: 'ЛНУ',
    facultyId: '1007',
    groupId: 'ІНА-35с',
    groupName: 'ІНА-35с',
    fetchedAt: '2026-11-26T00:00:00Z',
    sourceType: 'dated',
    coveredFrom: '2026-11-23',
    coveredTo: '2026-11-29',
    warnings: [],
    lessons: [
      {
        id: 'mon_b', date: '2026-11-23', dayOfWeek: 1, number: 1, startTime: '08:30', endTime: '09:50',
        subject: 'Перша іноземна мова', lessonType: 'П', teacher: 'доц. Заміна Б.Б.', group: 'ІНА-35с',
        groupLabel: 'Збірна група', isElective: false, universityId: 'lnu', updatedAt: '2026-11-26T00:00:00Z',
      },
      {
        id: 'mon_c', date: '2026-11-23', dayOfWeek: 1, number: 1, startTime: '08:30', endTime: '09:50',
        subject: 'Перша іноземна мова', lessonType: 'П', teacher: 'доц. Інший В.В.', group: 'ІНА-35с',
        groupLabel: 'Збірна група', isElective: false, universityId: 'lnu', updatedAt: '2026-11-26T00:00:00Z',
      },
      {
        id: 'tue_a', date: '2026-11-24', dayOfWeek: 2, number: 1, startTime: '08:30', endTime: '09:50',
        subject: 'Перша іноземна мова', lessonType: 'П', teacher: 'доц. Основний А.А.', group: 'ІНА-35с',
        groupLabel: 'Збірна група', isElective: false, universityId: 'lnu', updatedAt: '2026-11-26T00:00:00Z',
      },
      {
        id: 'tue_c', date: '2026-11-24', dayOfWeek: 2, number: 1, startTime: '08:30', endTime: '09:50',
        subject: 'Перша іноземна мова', lessonType: 'П', teacher: 'доц. Інший В.В.', group: 'ІНА-35с',
        groupLabel: 'Збірна група', isElective: false, universityId: 'lnu', updatedAt: '2026-11-26T00:00:00Z',
      },
    ],
  };
  const prBundle = toAppScheduleBundle(partialReplaceSchedule);
  const prDimKey = computeParallelDimensionKey('Перша іноземна мова');
  const prOptA = computeParallelOptionKey('Перша іноземна мова', 'доц. Основний А.А.');
  const monFiltered = filterLessons(prBundle.datedLessonsByIso['2026-11-23'] ?? [], {
    subgroup: 1, department: 'sp', electiveCourse: 'freelance', selectedParallelGroups: { [prDimKey]: prOptA },
  });
  const monUnfiltered = filterLessons(prBundle.datedLessonsByIso['2026-11-23'] ?? [], {
    subgroup: 1, department: 'sp', electiveCourse: 'freelance',
  });
  assert.equal(monFiltered.length, 0);
  assert.equal(monUnfiltered.length, 2, 'Unfiltered parallel fallback keeps replacement lessons discoverable in 1 tap');
});
