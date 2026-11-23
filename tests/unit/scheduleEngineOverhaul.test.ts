import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLnuScheduleHtml } from '../../src/integrations/universities/lnu/lnuParser';
import { buildStableLessonId, toAppScheduleBundle } from '../../src/integrations/universities/normalizers/scheduleNormalizer';
import { buildWeekGrid, filterLessons } from '../../src/utils/schedule';
import type { LessonFilterProfile } from '../../src/utils/schedule';

const SAMPLE_LNU_HTML = `
<html><body>
  <h4>19.11.2026 Четвер</h4>
  <table>
    <tr>
      <td>1</td>
      <td>08:30<br>09:50</td>
      <td>
        <span class="p_name">Методи та технології інженерії даних</span>
        <span class="p_type_name">Л</span>
        <span class="t_name">доцент Демків Л.С.</span>
        <span class="room_name">214/1</span>
      </td>
    </tr>
    <tr>
      <td>2</td>
      <td>10:10<br>11:30</td>
      <td>
        <span class="p_name">1. М'які обчислення</span>
        <span class="p_type_name">Лаб</span>
        <span class="t_name">доцент Рабош Р.В.</span>
        <span class="gr2_name">підгр. 1</span>
        <span class="room_name">101/1</span>
        <span class="p_name">2. Професійний Python</span>
        <span class="p_type_name">Лаб</span>
        <span class="t_name">проф. Свелеба С.А.</span>
        <span class="gr2_name">підгр. 2</span>
        <span class="room_name">102/1</span>
      </td>
    </tr>
    <tr>
      <td>3</td>
      <td>11:50<br>13:10</td>
      <td>
        <span class="p_name">Freelance: робота онлайн</span>
        <span class="p_type_name">ПрС</span>
        <span class="t_name">доц. Шот А.П.</span>
        <span class="gr2_name">збірна</span>
        <span class="room_name">301/1</span>
        <span class="p_name">Політичний дискурс кіберпанку</span>
        <span class="p_type_name">ПрС</span>
        <span class="t_name">ас. Ковальчук М.В.</span>
        <span class="gr2_name">збірна</span>
        <span class="room_name">302/1</span>
      </td>
    </tr>
  </table>
</body></html>
`;

describe('Schedule Engine Overhaul: Groups, Subgroups, Tracks & DVVS', () => {
  const normalized = parseLnuScheduleHtml(SAMPLE_LNU_HTML, {
    groupId: 'ФЕП-33с',
    groupName: 'ФЕП-33с',
  });
  const bundle = toAppScheduleBundle(normalized);
  const lessons = bundle.datedLessonsByIso['2026-11-19'] ?? [];

  const freelanceLesson = normalized.lessons.find((l) => l.subject.includes('Freelance'));
  const cyberpunkLesson = normalized.lessons.find((l) => l.subject.includes('кіберпанку'));

  it('extracts elective keys without treating numbered subjects as tracks', () => {
    assert.ok(freelanceLesson?.isElective);
    assert.ok(freelanceLesson?.electiveKey?.startsWith('el_'));
    assert.ok(cyberpunkLesson?.isElective);
    assert.notEqual(freelanceLesson?.electiveKey, cyberpunkLesson?.electiveKey);
    assert.equal(
      normalized.lessons.find((l) => l.subject.includes("М'які"))?.trackNumber,
      undefined
    );
    assert.equal(
      normalized.lessons.find((l) => l.subject.includes('Python'))?.trackNumber,
      undefined
    );
  });

  it('hides ALL DVVS when student has not selected any DVVS', () => {
    const profile: LessonFilterProfile = {
      subgroup: 1,
      department: 'sp',
      electiveCourse: 'freelance',
      selectedElectives: [],
    };
    const filtered = filterLessons(lessons, profile);
    assert.equal(filtered.some((l) => l.isElective), false);
    assert.equal(filtered.some((l) => l.name.includes('інженерії даних')), true);
  });

  it('separates two students in the same group with different DVVS and subgroups', () => {
    const studentA: LessonFilterProfile = {
      subgroup: 1,
      department: 'sp',
      electiveCourse: 'freelance',
      selectedElectives: [freelanceLesson!.electiveKey!],
      selectedTrack: 1,
    };
    const studentB: LessonFilterProfile = {
      subgroup: 2,
      department: 'sp',
      electiveCourse: 'freelance',
      selectedElectives: [cyberpunkLesson!.electiveKey!],
      selectedTrack: 2,
    };

    const resA = filterLessons(lessons, studentA);
    const resB = filterLessons(lessons, studentB);

    // Mandatory lecture shared by both
    assert.ok(resA.some((l) => l.name.includes('інженерії даних')));
    assert.ok(resB.some((l) => l.name.includes('інженерії даних')));

    // Student A sees subgroup 1 + Freelance
    assert.ok(resA.some((l) => l.name.includes("М'які обчислення")));
    assert.equal(resA.some((l) => l.name.includes('Python')), false);
    assert.ok(resA.some((l) => l.name.includes('Freelance')));
    assert.equal(resA.some((l) => l.name.includes('кіберпанку')), false);

    // Student B sees subgroup 2 + Cyberpunk
    assert.ok(resB.some((l) => l.name.includes('Python')));
    assert.equal(resB.some((l) => l.name.includes("М'які обчислення")), false);
    assert.ok(resB.some((l) => l.name.includes('кіберпанку')));
    assert.equal(resB.some((l) => l.name.includes('Freelance')), false);
  });

  it('buildWeekGrid uses datedLessonsByIso when available', () => {
    const grid = buildWeekGrid(
      bundle.schedule,
      {
        subgroup: 1,
        department: 'sp',
        electiveCourse: 'freelance',
        selectedElectives: [freelanceLesson!.electiveKey!],
      },
      [new Date('2026-11-19T12:00:00Z')],
      'numerator',
      bundle.datedLessonsByIso
    );
    assert.equal(grid.days[0]?.lessons.length, 3);
  });

  it('Phase E: preserves facultyId in bundle and keeps buildStableLessonId backward-compatible', () => {
    const withFaculty = parseLnuScheduleHtml(SAMPLE_LNU_HTML, {
      facultyId: '1',
      groupId: 'ФЕП-33с',
      groupName: 'ФЕП-33с',
    });
    assert.equal(withFaculty.facultyId, '1');
    const id = buildStableLessonId({
      universityId: 'lnu',
      groupId: 'ФЕП-33с',
      dayOfWeek: 4,
      pairNumber: 1,
      subject: 'Методи та технології інженерії даних',
    });
    assert.ok(id.startsWith('lnu_'));
  });
});
