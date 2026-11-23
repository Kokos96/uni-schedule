import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PairCard } from '../../src/components/schedule/PairCard';
import { WeekGrid } from '../../src/components/schedule/WeekGrid';
import type { Classroom, Lesson, Teacher } from '../../src/types';
import type { WeekGridData } from '../../src/utils/schedule';

const lesson: Lesson = {
  id: 'lesson_1',
  order: 1,
  startTime: '08:30',
  endTime: '09:50',
  name: 'Тестова дисципліна',
  type: 'Лекція',
  teacherId: 't_live_only',
  classroomId: 'c_live_only',
  weekType: 'both',
};

const weekGrid: WeekGridData = {
  days: [{
    dayNumber: 1,
    dayName: 'Понеділок',
    date: new Date(2026, 10, 23),
    isoDate: '2026-11-23',
    lessons: [lesson],
    lessonsByOrder: { 1: [lesson] },
  }],
  slots: [{ order: 1, startTime: '08:30', endTime: '09:50' }],
  activeSlotOrders: [1],
};

function renderGrid(teachersMap: Map<string, Teacher>, classroomsMap: Map<string, Classroom>) {
  return renderToStaticMarkup(createElement(WeekGrid, {
    weekGrid,
    teachersMap,
    classroomsMap,
    selectedIso: '2026-11-23',
    todayIso: '2026-11-23',
    getAttendanceStatus: () => null,
    onToggleAttendance: () => {},
    getNoteCountForLesson: () => 0,
    onOpenNotes: () => {},
    onSelectDate: () => {},
  }));
}

describe('week grid schedule metadata', () => {
  it('uses the active university source maps for live lesson labels', () => {
    const html = renderGrid(
      new Map([['t_live_only', { id: 't_live_only', fullName: 'Коваль Олена', department: '', subjects: [] }]]),
      new Map([['c_live_only', { id: 'c_live_only', code: '305', building: 'Головний', floor: 3 }]])
    );
    assert.match(html, /Коваль/);
    assert.match(html, /305/);
    assert.doesNotMatch(html, /t_live_only|c_live_only/);
  });

  it('shows a readable room fallback when source metadata is missing', () => {
    const html = renderGrid(new Map(), new Map());
    assert.match(html, /Аудиторію не вказано/);
    assert.match(html, /Викладача не вказано/);
    assert.doesNotMatch(html, /t_live_only|c_live_only/);
  });

  it('keeps day cards readable with missing metadata', () => {
    const html = renderToStaticMarkup(createElement(PairCard, {
      lesson,
      attendanceStatus: null,
      onToggleAttendance: () => {},
      onOpenNotes: () => {},
    }));
    assert.match(html, /Викладача не вказано/);
    assert.match(html, /Аудиторію не вказано/);
    assert.doesNotMatch(html, /Ауд\.\s*Аудиторію не вказано/);
    assert.doesNotMatch(html, /t_live_only|c_live_only/);
  });

  it('renders PairCard without Ауд. prefix when classroom code is dash and with Ауд. when code exists', () => {
    const dashHtml = renderToStaticMarkup(createElement(PairCard, {
      lesson,
      classroom: { id: 'c_live_only', code: '—', building: '', floor: 0 },
      attendanceStatus: null,
      onToggleAttendance: () => {},
      onOpenNotes: () => {},
    }));
    assert.match(dashHtml, /Аудиторію не вказано/);
    assert.doesNotMatch(dashHtml, /Ауд\./);

    const validHtml = renderToStaticMarkup(createElement(PairCard, {
      lesson,
      classroom: { id: 'c_live_only', code: '305', building: 'Головний', floor: 3 },
      attendanceStatus: null,
      onToggleAttendance: () => {},
      onOpenNotes: () => {},
    }));
    assert.match(validHtml, /Ауд\.\s*<strong[^>]*>305<\/strong>/);
  });

  it('never truncates missing teacher placeholder to Викладача or exposes raw internal IDs', () => {
    const html = renderGrid(
      new Map([['t_live_only', { id: 't_live_only', fullName: 'Викладача не вказано', department: '', subjects: [] }]]),
      new Map([['c_live_only', { id: 'c_live_only', code: 'c_live_only', building: '', floor: 0 }]])
    );
    assert.match(html, /Викладача не вказано/);
    assert.match(html, /Аудиторію не вказано/);
    assert.doesNotMatch(html, /t_live_only|c_live_only/);
  });
});
