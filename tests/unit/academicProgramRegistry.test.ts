import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasDepartmentSupportForGroup,
  resolveDepartmentsForLesson,
} from '../../src/data/academicProgramRegistry';
import { toAppScheduleBundle } from '../../src/integrations/universities/normalizers/scheduleNormalizer';
import { filterLessons } from '../../src/utils/schedule';

describe('Stage E: academicProgramRegistry for live ФЕП-31с..34с groups', () => {
  it('enables department support for canonical ФЕП-31с..34с (including homoglyphs) and rejects unknown groups', () => {
    for (const g of ['ФЕП-31с', 'ФЕП-32с', 'ФЕП-33с', 'ФЕП-34с', 'ФЕП-33c']) {
      assert.equal(hasDepartmentSupportForGroup('lnu', g), true, `Expected support for ${g}`);
    }
    assert.equal(hasDepartmentSupportForGroup('lnu', 'ІНА-34с'), false);
    assert.equal(hasDepartmentSupportForGroup('lnu', 'ПМІ-31с'), false);
    assert.equal(hasDepartmentSupportForGroup('other', 'ФЕП-33с'), false);
  });

  it('maps verified department subjects (Latin C & Cyrillic С) and preserves shared subjects for all departments', () => {
    assert.deepEqual(
      resolveDepartmentsForLesson('lnu', 'ФЕП-32с', 'Нереляційні та розподілені бази даних'),
      ['sp', 'oit']
    );
    assert.deepEqual(
      resolveDepartmentsForLesson('lnu', 'ФЕП-34с', 'Вибрані розділи мови програмування С'),
      ['rks', 'rkt']
    );
    assert.equal(resolveDepartmentsForLesson('lnu', 'ФЕП-31с', '2. Професійний Python'), undefined);
    assert.equal(resolveDepartmentsForLesson('lnu', 'ФЕП-31с', "1. М'які обчислення"), undefined);
  });

  it('filters live normalized ФЕП-33с schedule consistently across СП/ОІТ vs РКС/РКТ', () => {
    const bundle = toAppScheduleBundle({
      universityId: 'lnu',
      universityName: 'ЛНУ ім. Івана Франка',
      facultyId: '1005',
      groupId: 'ФЕП-33с',
      groupName: 'ФЕП-33с',
      fetchedAt: '2026-11-25T10:00:00.000Z',
      warnings: [],
      lessons: [
        { id: 'db', dayOfWeek: 1, number: 1, startTime: '08:30', endTime: '09:50', subject: 'Нереляційні та розподілені бази даних', lessonType: 'Л', universityId: 'lnu' },
        { id: 'c', dayOfWeek: 1, number: 1, startTime: '08:30', endTime: '09:50', subject: 'Вибрані розділи мови програмування С', lessonType: 'Л', universityId: 'lnu' },
        { id: 'py', dayOfWeek: 1, number: 2, startTime: '10:10', endTime: '11:30', subject: '2. Професійний Python', lessonType: 'Л', universityId: 'lnu' },
      ],
    });
    const monday = bundle.schedule[0]!.lessons;
    const spNames = filterLessons(monday, { department: 'sp', subgroup: 1, electiveCourse: 'freelance' }).map((l) => l.name);
    const rksNames = filterLessons(monday, { department: 'rks', subgroup: 1, electiveCourse: 'freelance' }).map((l) => l.name);
    assert.deepEqual(spNames, ['Нереляційні та розподілені бази даних', '2. Професійний Python']);
    assert.deepEqual(rksNames, ['Вибрані розділи мови програмування С', '2. Професійний Python']);
  });
});
