import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LivePairHero } from '../../src/components/schedule/LivePairHero';
import { WeekGrid } from '../../src/components/schedule/WeekGrid';
import { UniversitySelectorCard } from '../../src/components/settings/UniversitySelectorCard';
import { StatsView } from '../../src/components/stats/StatsView';
import { ToastProvider } from '../../src/components/ui/Toast';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/hooks/useSettings';
import type { AttendanceRecord } from '../../src/types';

describe('hotfix schedule and attendance states', () => {
  it('shows an unsynced live profile as waiting for synchronization', () => {
    const resolved = normalizeSettings({
      ...DEFAULT_SETTINGS,
      scheduleSourceMode: 'live',
      universityProfile: {
        universityId: 'lnu', facultyId: '1005', groupId: 'ФЕП-33с', groupName: 'ФЕП-33с',
      },
    });
    const html = renderToStaticMarkup(createElement(ToastProvider, null,
      createElement(UniversitySelectorCard, {
        resolved, onUpdate: () => {}, syncStatus: 'idle',
      })
    ));
    assert.match(html, /Очікує синхронізації/);
    assert.doesNotMatch(html, /Вбудований ФЕП-33с/); // Explicit switch remains available.
  });

  it('distinguishes local profile save from failed server acknowledgement', () => {
    const resolved = normalizeSettings({ ...DEFAULT_SETTINGS, scheduleSourceMode: 'builtin' });
    const html = renderToStaticMarkup(createElement(ToastProvider, null,
      createElement(UniversitySelectorCard, {
        resolved,
        onUpdate: () => {},
        profileSyncStatus: 'error',
        profileSyncError: 'Мережа недоступна',
      })
    ));
    assert.match(html, /Профіль збережено локально, але серверне підтвердження не отримано/);
    assert.match(html, /Повторимо спробу автоматично/);
  });

  it('requires a deliberate action to replace a newer server profile', () => {
    const resolved = normalizeSettings({ ...DEFAULT_SETTINGS, scheduleSourceMode: 'builtin' });
    const html = renderToStaticMarkup(createElement(ToastProvider, null,
      createElement(UniversitySelectorCard, {
        resolved,
        onUpdate: () => {},
        profileSyncStatus: 'conflict',
        onConfirmProfileOverwrite: () => {},
      })
    ));
    assert.match(html, /Профіль змінився на іншому пристрої/);
    assert.match(html, /Застосувати мій вибір/);
  });

  it('does not call an unavailable today a free day', () => {
    const html = renderToStaticMarkup(createElement(LivePairHero, {
      todayLessons: [],
      teachersMap: new Map(),
      classroomsMap: new Map(),
      todayIso: '2026-11-25',
      todayAvailability: 'outside_coverage',
      onNavigateToSettings: () => {},
      getStatus: () => null,
      onToggleAttendance: () => {},
      onOpenNotes: () => {},
    }));
    assert.match(html, /Розклад на сьогодні недоступний/);
    assert.match(html, /Відкрити налаштування розкладу/);
    assert.doesNotMatch(html, /Сьогодні занять за розкладом немає/);
  });

  it('labels an uncovered week as unavailable', () => {
    const html = renderToStaticMarkup(createElement(WeekGrid, {
      weekGrid: { days: [], slots: [], activeSlotOrders: [] },
      weekAvailability: 'outside_coverage',
      teachersMap: new Map(),
      classroomsMap: new Map(),
      selectedIso: '2026-11-25',
      todayIso: '2026-11-25',
      getAttendanceStatus: () => null,
      onToggleAttendance: () => {},
      getNoteCountForLesson: () => 0,
      onOpenNotes: () => {},
      onSelectDate: () => {},
      onNavigateToSettings: () => {},
    }));
    assert.match(html, /Розклад недоступний/);
    assert.doesNotMatch(html, /На цей тиждень пар немає/);
  });

  it('describes unmatched legacy attendance without claiming another group', () => {
    const records: AttendanceRecord[] = Array.from({ length: 158 }, (_, index) => ({
      lessonId: `legacy_${index}`,
      date: '2026-11-25',
      status: 'present',
    }));
    const html = renderToStaticMarkup(createElement(StatsView, {
      records,
      settings: { ...DEFAULT_SETTINGS, scheduleSourceMode: 'live' },
      scheduleMap: new Map(),
    }));
    assert.match(html, /158 відміток не зіставлено з поточним розкладом/);
    assert.match(html, /вони збережені/);
    assert.doesNotMatch(html, /записів інших груп/);
  });
});
