import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/hooks/useSettings';

const historicalProfile = {
  universityId: 'lnu',
  facultyId: '1005',
  groupId: 'ФЕП-33с',
  groupName: 'ФЕП-33с',
};

describe('explicit schedule source mode', () => {
  it('treats a fresh client as unconfigured, not implicitly built-in', () => {
    assert.equal(DEFAULT_SETTINGS.scheduleSourceMode, 'unconfigured');
    assert.equal(normalizeSettings(null).scheduleSourceMode, 'unconfigured');
  });

  it('migrates a legacy selected group to live without changing its identity', () => {
    const settings = normalizeSettings({ universityProfile: historicalProfile });
    assert.equal(settings.scheduleSourceMode, 'live');
    assert.equal(settings.universityProfile?.groupId, 'ФЕП-33с');
  });

  it('keeps explicit builtin intent separate from a stale historical profile', () => {
    const settings = normalizeSettings({
      scheduleSourceMode: 'builtin',
      universityProfile: historicalProfile,
    });
    assert.equal(settings.scheduleSourceMode, 'builtin');
    assert.equal(settings.universityProfile, undefined);
  });

  it('rejects live mode without a valid group and retains personal preferences', () => {
    const settings = normalizeSettings({ scheduleSourceMode: 'live', department: 'rks' });
    assert.equal(settings.scheduleSourceMode, 'unconfigured');
    assert.equal(settings.department, 'rks');
  });
});
