import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { encodeCp1251Component, encodeCp1251Form } from '../../src/integrations/universities/lnu/cp1251';
import { hasClass, parseHtmlStructure } from '../../src/integrations/universities/lnu/htmlStructure';
import { LnuAdapter } from '../../src/integrations/universities/lnu/lnuAdapter';
import {
  inferCourseFromGroupName,
  parseLnuFacultiesHtml,
  parseLnuGroupsJson,
  parseLnuScheduleHtml,
} from '../../src/integrations/universities/lnu/lnuParser';
import {
  buildStableLessonId,
  normalizeLessonType,
  toAppScheduleBundle,
} from '../../src/integrations/universities/normalizers/scheduleNormalizer';
import { getUniversityAdapter, listUniversities } from '../../src/integrations/universities/registry';

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures');

describe('integrations/universities/lnu/cp1251', () => {
  it('encodes Ukrainian group names into CP1251 percent-encoding', () => {
    // Ф=0xD4, Е=0xC5, П=0xCF, -=0x2D, 3=0x33, с=0xF1
    assert.equal(encodeCp1251Component('ФЕП-33с'), '%D4%C5%CF-33%F1');
    assert.equal(
      encodeCp1251Form({ n: '700', group: 'ФЕП-33с' }),
      'n=700&group=%D4%C5%CF-33%F1'
    );
  });
});

describe('integrations/universities/lnu/lnuParser', () => {
  const htmlFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'lnu-timetable.html'), 'utf-8');
  // Captured from official dekanat.lnu.edu.ua n=700 for ФЕП-33с, 23–29 Nov 2026.
  const liveFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'lnu-fep33s-2026-11-23-live.html'), 'utf-8');
  const groupsFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'lnu-groups.json'), 'utf-8');

  it('extracts faculties from LNU select element excluding placeholder 0', () => {
    const faculties = parseLnuFacultiesHtml(htmlFixture);
    assert.equal(faculties.length, 2);
    assert.equal(faculties[0]?.id, '1005');
    assert.match(faculties[0]?.name ?? '', /електроніки/);
  });

  it('deduplicates and parses LNU groups JSON and infers course', () => {
    const groups = parseLnuGroupsJson(groupsFixture);
    assert.deepEqual(
      groups.map((g) => g.name),
      ['АБЛБ-1с', 'ФЕП-11с', 'ФЕП-21с', 'ФЕП-33с', 'ПМІ-41']
    );
    assert.equal(inferCourseFromGroupName('ФЕП-33с'), 3);
    assert.equal(inferCourseFromGroupName('ПМІ-41'), 4);
    assert.equal(inferCourseFromGroupName('АСП'), undefined);
  });

  it('parses dates, times, multiple lessons per slot, subgroups, electives, and missing fields', () => {
    const normalized = parseLnuScheduleHtml(htmlFixture, {
      groupId: 'ФЕП-33с',
      groupName: 'ФЕП-33с',
    });

    assert.equal(normalized.universityId, 'lnu');
    assert.equal(normalized.warnings.length, 0);
    assert.equal(normalized.lessons.length, 6);

    // Slot 3 on Monday: 2 parallel elective lessons, second missing room
    const mondayElectives = normalized.lessons.filter(
      (l) => l.date === '2026-11-23' && l.number === 3
    );
    assert.equal(mondayElectives.length, 2);
    assert.equal(mondayElectives[0]?.room, '509/І');
    assert.equal(mondayElectives[0]?.isElective, true);
    assert.equal(mondayElectives[1]?.subject, 'Google analytics: інструменти та лайфхаки');
    assert.equal(mondayElectives[1]?.room, undefined);

    // Slot 1 on Tuesday: subgroup 1 and subgroup 2
    const tuesdayLabs = normalized.lessons.filter(
      (l) => l.date === '2026-11-24' && l.number === 1
    );
    assert.equal(tuesdayLabs[0]?.subgroup, 1);
    assert.equal(tuesdayLabs[1]?.subgroup, 2);

    // Slot 4 on Tuesday: missing teacher and room
    const noMetaLesson = normalized.lessons.find(
      (l) => l.date === '2026-11-24' && l.number === 4
    );
    assert.equal(noMetaLesson?.subject, 'Програмування');
    assert.equal(noMetaLesson?.teacher, undefined);
    assert.equal(noMetaLesson?.room, undefined);
    assert.equal(normalizeLessonType(noMetaLesson?.lessonType ?? ''), 'Практична');
  });

  it('parses the captured official ФЕП-33с week without inventing tracks', () => {
    const normalized = parseLnuScheduleHtml(liveFixture, {
      facultyId: '1005', groupId: 'ФЕП-33с', groupName: 'ФЕП-33с',
    }, { coveredFrom: '2026-11-23', coveredTo: '2026-11-29' });
    assert.equal(normalized.sourceType, 'dated');
    assert.equal(normalized.coveredFrom, '2026-11-23');
    assert.ok(normalized.lessons.length > 20);
    assert.ok(normalized.lessons.some((lesson) => lesson.subject === 'Freelance: робота онлайн' && lesson.isElective));
    assert.ok(normalized.lessons.some((lesson) => lesson.subject.includes('Нереляційні та розподілені бази даних')));
    assert.ok(normalized.lessons.some((lesson) => lesson.subject.includes('Професійний Python') && lesson.trackNumber === undefined));
    assert.equal(normalized.lessons.some((lesson) => lesson.subject === 'Людина і космос'), false);
    assert.equal(normalized.warnings.length, 0);
  });

  it('handles extra cells, nested labels, numeric entities and duplicate rows', () => {
    const html = `<h4>24.11.2026</h4><table>
      <tr><td>1</td><td>08:30<br>09:50</td><td><div><span class='p_name'>Фізика &#x1F680; &amp; математика</span><span class='p_type_name'>Л</span><span class='t_name'><b>Іван</b> Петренко</span><span class='room_name'>101/Б</span></div></td><td>Примітка</td></tr>
      <tr><td>1</td><td>08:30<br>09:50</td><td><span class='p_name'>Фізика &#x1F680; &amp; математика</span><span class='p_type_name'>Л</span><span class='t_name'>Іван Петренко</span><span class='room_name'>101/Б</span></td></tr>
    </table>`;
    const normalized = parseLnuScheduleHtml(html, { groupId: 'X-1', groupName: 'X-1' });
    assert.equal(normalized.lessons.length, 1);
    assert.equal(normalized.lessons[0]?.subject, 'Фізика 🚀 & математика');
    assert.equal(normalized.lessons[0]?.teacher, 'Іван Петренко');
  });

  it('keeps <script>/<style> raw, preserves inline word boundaries, and strips self-closing slash in hasClass', () => {
    const doc = parseHtmlStructure('<div class=box/><script>if (a < b) { const x = "<h4>23.11.2026</h4>"; }</script><style>.x > .y { color: red; }</style><span class=p_name/></div>');
    const div = doc.children.find((c) => typeof c !== 'string' && c.tag === 'div');
    assert.ok(div && typeof div !== 'string');
    assert.equal(hasClass(div, 'box'), true);

    const html = `
      <script>if (a < b) { document.write("<h4>29.11.2026</h4><table><tr><td>1</td></tr></table>"); }</script>
      <style>table > tr { display: block; }</style>
      <h4>24.11.2026 <small>Вівторок</small></h4>
      <table>
        <thead><tr><th>№</th><th>Час</th><th>Дисципліна</th></tr></thead>
        <tr>
          <td>1</td><td>08:30<br>09:50</td>
          <td>
            <span class="p_name">Хімія H<sub>2</sub>O &amp;lt;test&amp;gt;</span>
            <span class="p_type_name">Л</span>
            <span class="t_name"><b>І</b>ван Петренко</span>
          </td>
        </tr>
      </table>`;
    const normalized = parseLnuScheduleHtml(html, { groupId: 'X-1', groupName: 'X-1' });
    assert.equal(normalized.warnings.length, 0);
    assert.equal(normalized.lessons.length, 1);
    assert.equal(normalized.lessons[0]?.subject, 'Хімія H2O &lt;test&gt;');
    assert.equal(normalized.lessons[0]?.teacher, 'Іван Петренко');
  });

  it('rejects broken HTML and unrecognized upstream responses including title-only <h4> on empty schedule', () => {
    assert.throws(() =>
      parseLnuScheduleHtml('plain text not html', { groupId: 'ФЕП-33с', groupName: 'ФЕП-33с' })
    );

    assert.throws(() => parseLnuScheduleHtml('<html><body><div>Помилка</div></body></html>', {
      groupId: 'ФЕП-33с', groupName: 'ФЕП-33с',
    }), /не знайдено дат/);

    const titleOnlyHtml = `
      <html><body>
        <h4>Львівський національний університет імені Івана Франка</h4>
        <h4 class="d-none d-sm-block">Розклад групи <a href="./timetable.cgi">ФЕП-33с</a> з 23.11.2026 по 29.11.2026</h4>
        <div class="alert alert-info">Заняття відсутні</div>
      </body></html>
    `;
    assert.throws(
      () => parseLnuScheduleHtml(titleOnlyHtml, { groupId: 'ФЕП-33с', groupName: 'ФЕП-33с' }),
      /не знайдено дат/
    );
  });
});

describe('integrations/universities/normalizers', () => {
  it('keeps lessonId invariant when teacher or room changes', () => {
    const idBefore = buildStableLessonId({
      universityId: 'lnu',
      groupId: 'ФЕП-33с',
      dayOfWeek: 2,
      pairNumber: 1,
      subject: '1. М`які обчислення',
      subgroup: 1,
    });

    const modifiedHtml = `
      <h4>24.11.2026 <small>Вівторок</small></h4>
      <table><tr>
        <td>1</td><td>08:30<br>09:50</td>
        <td>
          <span class="p_name">1. М\`які обчислення</span> (<span class="p_type_name">Лаб</span>)<br>
          <span class="t_name">Новий Викладач</span> <span class="gr2_name">(підгр. 1)</span><br>
          <span class="room_name">999/Г</span>
        </td>
      </tr></table>
    `;

    const parsedModified = parseLnuScheduleHtml(modifiedHtml, {
      groupId: 'ФЕП-33с',
      groupName: 'ФЕП-33с',
    });

    assert.equal(parsedModified.lessons[0]?.id, idBefore);
  });

  it('converts NormalizedSchedule into AppScheduleBundle with 1-indexed dayName and no fake empty directories', () => {
    const htmlFixture = fs.readFileSync(path.join(FIXTURES_DIR, 'lnu-timetable.html'), 'utf-8');
    const normalized = parseLnuScheduleHtml(htmlFixture, {
      groupId: 'ФЕП-33с',
      groupName: 'ФЕП-33с',
    });

    const bundle = toAppScheduleBundle(normalized);
    assert.equal(bundle.schedule.length, 7);
    assert.equal(bundle.schedule[0]?.dayNumber, 1);
    assert.equal(bundle.schedule[0]?.dayName, 'Понеділок');
    assert.equal(bundle.schedule[1]?.dayName, 'Вівторок');
    assert.equal(bundle.schedule[6]?.dayNumber, 7);
    assert.equal(bundle.schedule[6]?.dayName, 'Неділя');

    assert.ok(bundle.teachers.length >= 4);
    assert.ok(bundle.classrooms.length >= 3);
    assert.equal(
      bundle.teachers.some((t) => t.fullName === 'Викладача не вказано'),
      false
    );
    assert.equal(
      bundle.classrooms.some((c) => c.code === '—' || c.building === 'Університет'),
      false
    );

    const noMetaLesson = bundle.datedLessonsByIso['2026-11-24']?.find(
      (l) => l.name === 'Програмування'
    );
    assert.equal(noMetaLesson?.teacherId, '');
    assert.equal(noMetaLesson?.classroomId, '');

    assert.equal(bundle.datedLessonsByIso['2026-11-23']?.length, 3);
    assert.equal(bundle.datedLessonsByIso['2026-11-24']?.length, 3);
  });
});

describe('integrations/universities/registry', () => {
  it('exposes LNU as live and Other University honestly as manual_only', async () => {
    const list = listUniversities();
    assert.equal(list.length, 2);

    const lnu = getUniversityAdapter('lnu');
    const other = getUniversityAdapter('other');
    assert.equal(lnu?.meta.supportStatus, 'live');
    assert.equal(other?.meta.supportStatus, 'manual_only');

    await assert.rejects(
      () =>
        other!.fetchSchedule({
          universityId: 'other',
          groupId: 'TEST-1',
          groupName: 'TEST-1',
        }),
      /недоступне/
    );
  });

  it('includes all 23 live LNU faculties in fallback list', async () => {
    const adapter = new LnuAdapter('http://127.0.0.1:0/unreachable', null);
    const faculties = await adapter.getFaculties({ forceRefresh: true });
    assert.equal(faculties.length, 23);
    assert.ok(faculties.some((f) => f.id === '1021'));
    assert.ok(faculties.some((f) => f.id === '1024'));
    assert.ok(faculties.some((f) => f.id === '1025'));
    assert.ok(faculties.some((f) => f.id === '1020'));
  });
});
