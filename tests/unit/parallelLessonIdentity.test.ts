import { it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLnuScheduleHtml } from '../../src/integrations/universities/lnu/lnuParser';
import { buildStableLessonId } from '../../src/integrations/universities/normalizers/scheduleNormalizer';

it('separates parallel sessions deterministically and keeps IDs stable across weeks regardless of order', () => {
  const baseId = buildStableLessonId({
    universityId: 'lnu',
    groupId: 'G-1',
    dayOfWeek: 1,
    pairNumber: 1,
    subject: 'Програмування',
  });

  const week1Html = `<h4>23.11.2026 Понеділок</h4><table><tr>
    <td>1</td><td>08:30<br>09:50</td><td>
    <span class="p_name">Програмування</span><span class="p_type_name">Лаб</span>
    <span class="t_name">Викладач А</span><span class="room_name">101</span>
    <span class="p_name">Програмування</span><span class="p_type_name">Лаб</span>
    <span class="t_name">Викладач Б</span><span class="room_name">102</span>
    </td></tr></table>`;

  const week2HtmlReversed = `<h4>30.11.2026 Понеділок</h4><table><tr>
    <td>1</td><td>08:30<br>09:50</td><td>
    <span class="p_name">Програмування</span><span class="p_type_name">Лаб</span>
    <span class="t_name">Викладач Б</span><span class="room_name">102</span>
    <span class="p_name">Програмування</span><span class="p_type_name">Лаб</span>
    <span class="t_name">Викладач А</span><span class="room_name">101</span>
    </td></tr></table>`;

  const week1 = parseLnuScheduleHtml(week1Html, { groupId: 'G-1', groupName: 'G-1' });
  const week2 = parseLnuScheduleHtml(week2HtmlReversed, { groupId: 'G-1', groupName: 'G-1' });

  assert.equal(week1.lessons.length, 2);
  assert.equal(week2.lessons.length, 2);
  assert.notEqual(week1.lessons[0]!.id, week1.lessons[1]!.id);
  assert.ok(week1.lessons[0]!.id.startsWith(baseId + '_'));
  assert.ok(week1.lessons[1]!.id.startsWith(baseId + '_'));
  assert.ok(week1.warnings.some((warning) => warning.includes('паралельних')));

  const w1TeacherA = week1.lessons.find((l) => l.teacher === 'Викладач А');
  const w1TeacherB = week1.lessons.find((l) => l.teacher === 'Викладач Б');
  const w2TeacherA = week2.lessons.find((l) => l.teacher === 'Викладач А');
  const w2TeacherB = week2.lessons.find((l) => l.teacher === 'Викладач Б');

  assert.equal(w1TeacherA?.id, w2TeacherA?.id);
  assert.equal(w1TeacherB?.id, w2TeacherB?.id);
});
