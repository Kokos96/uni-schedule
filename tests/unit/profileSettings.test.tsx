import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileSettingsSection } from '../../src/components/settings/ProfileSettingsSection';
import { SettingsView } from '../../src/components/settings/SettingsView';
import { ToastProvider } from '../../src/components/ui/Toast';
import { DEFAULT_SETTINGS } from '../../src/hooks/useSettings';

function renderProfile(options: {
  groupId?: string;
  universityId?: string;
  hasSubgroups?: boolean;
  hasDepartments?: boolean;
  electives?: Array<{ key: string; subject: string }>;
  selectedElectives?: string[];
  isUsingCustomGroup?: boolean;
}) {
  return renderToStaticMarkup(
    React.createElement(
      ToastProvider,
      null,
      React.createElement(ProfileSettingsSection, {
        resolved: {
          ...DEFAULT_SETTINGS,
          scheduleSourceMode: options.groupId ? 'live' : 'builtin',
          ...(options.selectedElectives ? { selectedElectives: options.selectedElectives } : {}),
          ...(options.groupId
            ? {
                universityProfile: {
                  universityId: options.universityId ?? 'lnu',
                  groupId: options.groupId,
                  groupName: options.groupId,
                },
              }
            : {}),
        },
        onUpdate: () => {},
        hasSubgroups: options.hasSubgroups,
        hasDepartments: options.hasDepartments,
        availableElectives: options.electives,
        isUsingCustomGroup: options.isUsingCustomGroup,
      })
    )
  );
}

describe('academic profile controls', () => {
  it('does not imply the built-in group on an unconfigured first launch', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(SettingsView, {
        settings: { ...DEFAULT_SETTINGS },
        onUpdate: () => {},
      }))
    );
    assert.match(html, /Профіль не налаштовано/);
    assert.doesNotMatch(html, /Вибір кафедри/);
  });

  it('shows department choices for builtin schedule', () => {
    const html = renderProfile({});
    assert.match(html, /Вибір кафедри/);
    assert.match(html, /СП/);
    assert.match(html, /ОІТ/);
  });

  it('hides department selector and shows honest note for live LNU schedule without department metadata (even for ФЕП-33с)', () => {
    const html = renderProfile({ groupId: 'ФЕП-33с', isUsingCustomGroup: true, hasDepartments: false });
    assert.doesNotMatch(html, /Вибір кафедри/);
    assert.match(html, /Поділ за кафедрами/);
    assert.match(html, /не передає кодів кафедр для автоматичного фільтрування/);
  });

  it('shows department choices when a live schedule explicitly provides department metadata', () => {
    const html = renderProfile({ groupId: 'ФЕП-33с', isUsingCustomGroup: true, hasDepartments: true });
    assert.match(html, /Вибір кафедри/);
    assert.match(html, /СП/);
  });

  it('hides department selector and subgroup controls for other groups without subgroup or department evidence', () => {
    const html = renderProfile({ groupId: 'ПМІ-41', hasSubgroups: false, isUsingCustomGroup: true });
    assert.doesNotMatch(html, /Вибір кафедри/);
    assert.doesNotMatch(html, /Підгрупа для лабораторних/);
    assert.match(html, /Поділ за кафедрами/);
  });

  it('does not offer built-in electives when a live profile has no synced schedule', () => {
    const html = renderProfile({ groupId: 'ПМІ-41', isUsingCustomGroup: false });
    assert.match(html, /Отримай розклад групи/);
    assert.doesNotMatch(html, /Людина і космос/);
  });

  it('lists only electives discovered in the selected live schedule', () => {
    const html = renderProfile({
      groupId: 'ПМІ-41',
      isUsingCustomGroup: true,
      electives: [{ key: 'el_test', subject: 'Перевірена вибіркова' }],
    });
    assert.match(html, /Перевірена вибіркова/);
    assert.doesNotMatch(html, /Людина і космос/);
  });

  it('preserves and displays saved selectedElectives outside the current 18-day window', () => {
    const html = renderProfile({
      groupId: 'ПМІ-41',
      isUsingCustomGroup: true,
      electives: [{ key: 'el_current', subject: 'Поточна вибіркова' }],
      selectedElectives: ['el_current', 'el_missing_from_window'],
    });
    assert.match(html, /Поточна вибіркова/);
    assert.match(html, /missing from window/);
    assert.match(html, /Збережено \(поза поточним вікном розкладу\)/);
  });

  it('keeps saved selectedElectives visible even when current window has zero electives', () => {
    const html = renderProfile({
      groupId: 'ПМІ-41',
      isUsingCustomGroup: true,
      electives: [],
      selectedElectives: ['el_osnovy_ai'],
    });
    assert.match(html, /osnovy ai/);
    assert.match(html, /Збережено \(поза поточним вікном розкладу\)/);
  });

  it('does not hardcode ФЕП-33с in selector inputs and uses Ukrainian labels in SettingsView', () => {
    const builtinHtml = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(SettingsView, {
          settings: { ...DEFAULT_SETTINGS, scheduleSourceMode: 'builtin' },
          onUpdate: () => {},
        })
      )
    );
    assert.match(builtinHtml, /Усі факультети/);
    assert.match(builtinHtml, /Усі курси/);
    assert.match(builtinHtml, /Введіть назву групи/);
    assert.doesNotMatch(builtinHtml, /value="ФЕП-33с"/);
    assert.match(builtinHtml, /ФЕП-33с · СП/);
    assert.doesNotMatch(builtinHtml, /ФЕП-33с · SP/);
  });
});
