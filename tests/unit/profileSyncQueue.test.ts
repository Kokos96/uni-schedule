import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../src/hooks/useSettings';
import { ProfileSyncQueue } from '../../src/services/profileSyncQueue';
import { ensureRegisteredDevice } from '../../src/services/apiClient';
import type { ResolvedUserSettings } from '../../src/types';

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    },
  });
  return values;
}

function live(groupId: string): ResolvedUserSettings {
  return {
    ...DEFAULT_SETTINGS,
    scheduleSourceMode: 'live',
    universityProfile: { universityId: 'lnu', groupId, groupName: groupId },
  };
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('profile synchronization queue', () => {
  it('registers one device when concurrent profile writes start without auth', async () => {
    installStorage();
    const originalFetch = globalThis.fetch;
    let registrations = 0;
    try {
      globalThis.fetch = async () => {
        registrations += 1;
        await nextTick();
        return new Response(JSON.stringify({
          userId: 'test-user', deviceId: 'test-device', syncToken: 'test-token',
        }), { status: 200 });
      };
      const [first, second] = await Promise.all([
        ensureRegisteredDevice('https://api.test'),
        ensureRegisteredDevice('https://api.test'),
      ]);
      assert.equal(registrations, 1);
      assert.deepEqual(first, second);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('serializes rapid profile changes and acknowledges only the latest intent', async () => {
    const storage = installStorage();
    const calls: Array<{ group: string; revision: number }> = [];
    let finishFirst: ((revision: number) => void) | undefined;
    const queue = new ProfileSyncQueue(async (settings, revision) => {
      calls.push({ group: settings.universityProfile!.groupId, revision });
      if (calls.length === 1) {
        return new Promise((resolve) => {
          finishFirst = (nextRevision) => resolve({ status: 'ok', revision: nextRevision });
        });
      }
      return { status: 'ok', revision: 2 };
    }, () => {});

    queue.enqueue(live('A'));
    queue.enqueue(live('B'));
    assert.deepEqual(calls, [{ group: 'A', revision: 0 }]);
    finishFirst!(1);
    await nextTick();
    assert.deepEqual(calls, [{ group: 'A', revision: 0 }, { group: 'B', revision: 1 }]);
    assert.equal(queue.hasPending, false);
    assert.equal(storage.get('uni_schedule_profile_revision_v1'), '2');
    queue.dispose();
  });

  it('keeps failed offline intent across restart and retries on demand', async () => {
    const storage = installStorage();
    const initial = new ProfileSyncQueue(async () => { throw new Error('offline'); }, () => {});
    initial.enqueue({ ...DEFAULT_SETTINGS, scheduleSourceMode: 'builtin' });
    await nextTick();
    assert.equal(initial.hasPending, true);
    assert.ok(storage.get('uni_schedule_profile_pending_v1'));
    initial.dispose();

    const recovered = new ProfileSyncQueue(async (_settings, revision) => {
      assert.equal(revision, 0);
      return { status: 'ok', revision: 1 };
    }, () => {});
    recovered.start();
    await nextTick();
    assert.equal(recovered.hasPending, false);
    assert.equal(storage.get('uni_schedule_profile_pending_v1'), 'null');
    recovered.dispose();
  });

  it('blocks automatic overwrite on a revision conflict until the user confirms', async () => {
    installStorage();
    const revisions: number[] = [];
    const statuses: string[] = [];
    const queue = new ProfileSyncQueue(async (_settings, revision) => {
      revisions.push(revision);
      return revision === 0
        ? { status: 'conflict', revision: 4 }
        : { status: 'ok', revision: 5 };
    }, (status) => { statuses.push(status); });
    queue.enqueue(live('B'));
    await nextTick();
    queue.retry();
    await nextTick();
    assert.deepEqual(revisions, [0]);
    assert.equal(queue.hasPending, true);
    assert.equal(statuses.at(-1), 'conflict');
    queue.confirmLocalIntent();
    await nextTick();
    assert.deepEqual(revisions, [0, 4]);
    assert.equal(queue.currentRevision, 5);
    queue.dispose();
  });
});
