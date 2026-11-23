import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekGrid } from '../../src/utils/schedule';
import type { LessonFilterProfile } from '../../src/utils/schedule';
import type { Lesson, ScheduleDay } from '../../src/types';

const settings: LessonFilterProfile = {
  subgroup: 1,
  department: 'sp',
  electiveCourse: 'both',
  selectedElectives: [],
};

const lesson: Lesson = {
  id: 'dated-lesson',
  order: 1,
  startTime: '08:30',
  endTime: '09:50',
  name: 'Підтверджена пара',
  type: 'Лекція',
  teacherId: '',
  classroomId: '',
  weekType: 'both',
};

describe('exact-date timetable coverage', () => {
  it('does not repeat a dated lesson on the same weekday a week later', () => {
    const recurringShape: ScheduleDay[] = [{
      dayNumber: 1,
      dayName: 'Понеділок',
      lessons: [lesson],
    }];
    const dates = [new Date('2026-11-23T12:00:00'), new Date('2026-11-30T12:00:00')];
    const grid = buildWeekGrid(recurringShape, settings, dates, 'numerator', {
      '2026-11-23': [lesson],
    });
    assert.equal(grid.days[0].lessons.length, 1);
    assert.equal(grid.days[1].lessons.length, 0);
  });

  it('falls back to recurring schedule when datedLessonsByIso is empty', () => {
    const recurringShape: ScheduleDay[] = [{
      dayNumber: 1,
      dayName: 'Понеділок',
      lessons: [lesson],
    }];
    const dates = [new Date('2026-11-23T12:00:00')];
    const grid = buildWeekGrid(recurringShape, settings, dates, 'numerator', {});
    assert.equal(grid.days[0].lessons.length, 1);
    assert.equal(grid.days[0].lessons[0].id, 'dated-lesson');
  });

  it('does not filter exact-date lessons by weekParity', () => {
    const numeratorDatedLesson: Lesson = {
      ...lesson,
      id: 'dated-numerator-lesson',
      weekType: 'numerator',
    };
    const dates = [new Date('2026-11-23T12:00:00')];
    const grid = buildWeekGrid([], settings, dates, 'denominator', {
      '2026-11-23': [numeratorDatedLesson],
    });
    assert.equal(grid.days[0].lessons.length, 1);
    assert.equal(grid.days[0].lessons[0].id, 'dated-numerator-lesson');
  });
});
