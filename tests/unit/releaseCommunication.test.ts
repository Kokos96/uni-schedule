import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELEASES_CATALOG,
  buildReleaseNotificationPayload,
  compareSemver,
  getLatestPublishedRelease,
  getPublishedReleases,
  getReleaseByVersion,
  isValidSemver,
  type ReleaseEntry,
} from '../../src/data/releases';
import {
  computeReleaseViewState,
  mergeReleaseCatalogs,
  parseReleaseDeepLink,
} from '../../src/utils/releaseTracking';

test('SemVer comparison orders numerically (4.10.0 > 4.9.0, 4.3.1 > 4.3.0) and validates format', () => {
  assert.ok(compareSemver('4.10.0', '4.9.0') > 0);
  assert.ok(compareSemver('4.3.1', '4.3.0') > 0);
  assert.ok(compareSemver('5.0.0', '4.99.99') > 0);
  assert.equal(compareSemver('4.3.0', '4.3.0'), 0);
  assert.equal(isValidSemver('4.3.0'), true);
  assert.equal(isValidSemver('4.3'), false);
  assert.equal(isValidSemver('4.3.0-beta'), false);
});

test('Canonical release catalog hides draft v4.3.1 from published list and sorts newest-first', () => {
  const published = getPublishedReleases();
  assert.ok(published.length >= 5);
  assert.equal(
    published.some((r) => r.publicationStatus === 'draft'),
    false,
    'Draft release candidates must never appear in published list'
  );
  for (let i = 1; i < published.length; i += 1) {
    assert.ok(
      compareSemver(published[i - 1]!.version, published[i]!.version) > 0,
      'Published releases must be sorted newest-first by SemVer'
    );
  }
  const latest = getLatestPublishedRelease();
  assert.equal(latest?.version, '4.3.0');
  assert.equal(getReleaseByVersion('4.3.1', { includeDraft: false }), null);
  assert.equal(getReleaseByVersion('4.3.1', { includeDraft: true })?.version, '4.3.1');
});

test('computeReleaseViewState handles upgrade, new user onboarding, rollback, and installed < latest safely', () => {
  const published431: ReleaseEntry = {
    ...RELEASES_CATALOG.find((r) => r.version === '4.3.1')!,
    publicationStatus: 'published',
    publishedAt: '2026-11-27',
  };
  const catalog = [published431, ...getPublishedReleases()];

  // 1. Existing user upgraded from 4.3.0 -> 4.3.1: autoShowRelease fires once
  const upgraded = computeReleaseViewState({
    catalog,
    installedVersion: '4.3.1',
    lastInstalledVersion: '4.3.0',
    seenReleaseIds: ['rel_4_3_0'],
    isUnconfigured: false,
  });
  assert.equal(upgraded.autoShowRelease?.version, '4.3.1');
  assert.equal(upgraded.hasUnreadInstalledRelease, true);
  assert.equal(upgraded.hasAvailableUpdate, false);

  // 2. After marking rel_4_3_1 seen: never auto-shows again
  const afterSeen = computeReleaseViewState({
    catalog,
    installedVersion: '4.3.1',
    lastInstalledVersion: '4.3.0',
    seenReleaseIds: ['rel_4_3_0', 'rel_4_3_1'],
    isUnconfigured: false,
  });
  assert.equal(afterSeen.autoShowRelease, null);
  assert.equal(afterSeen.hasUnreadInstalledRelease, false);

  // 3. Brand-new user in onboarding: never blocks onboarding with What's New
  const newUser = computeReleaseViewState({
    catalog,
    installedVersion: '4.3.1',
    lastInstalledVersion: null,
    seenReleaseIds: [],
    isUnconfigured: true,
  });
  assert.equal(newUser.autoShowRelease, null);

  // 4. Rollback to 4.3.0 when rel_4_3_0 was already seen: no duplicate modal, but detects newer 4.3.1 available
  const rollback = computeReleaseViewState({
    catalog,
    installedVersion: '4.3.0',
    lastInstalledVersion: '4.3.1',
    seenReleaseIds: ['rel_4_3_0', 'rel_4_3_1'],
    isUnconfigured: false,
  });
  assert.equal(rollback.autoShowRelease, null);
  assert.equal(rollback.hasAvailableUpdate, true);
});

test('parseReleaseDeepLink validates same-origin query params and rejects invalid versions', () => {
  assert.deepEqual(parseReleaseDeepLink('?view=release&version=4.3.0'), { version: '4.3.0' });
  assert.deepEqual(parseReleaseDeepLink('?view=release&version=v4.2.1'), { version: '4.2.1' });
  assert.deepEqual(parseReleaseDeepLink('?view=release&version=invalid<script>'), {});
  assert.deepEqual(parseReleaseDeepLink('?view=release-history'), { openHistory: true });
  assert.equal(parseReleaseDeepLink('?date=2026-11-26'), null);
});

test('mergeReleaseCatalogs merges remote updates with offline fallback and ignores drafts', () => {
  const remote: ReleaseEntry[] = [
    {
      ...RELEASES_CATALOG[0]!,
      id: 'rel_4_4_0',
      version: '4.4.0',
      publicationStatus: 'published',
      publishedAt: '2026-12-01',
    },
    {
      ...RELEASES_CATALOG[0]!,
      id: 'rel_4_5_0',
      version: '4.5.0',
      publicationStatus: 'draft',
      publishedAt: null,
    },
  ];
  const merged = mergeReleaseCatalogs(remote);
  assert.equal(merged[0]?.version, '4.4.0');
  assert.equal(merged.some((r) => r.version === '4.5.0'), false);
  const payload = buildReleaseNotificationPayload(merged[0]!);
  assert.equal(payload.url, '/?view=release&version=4.4.0');
});

test('handles draft-in-bundle -> API publish -> offline persistence, rollback unpublish, and skipped versions', () => {
  // 1. Before publish: 4.3.1 is draft in RELEASES_CATALOG, so merged published catalog hides it
  const beforePublish = mergeReleaseCatalogs(null, getPublishedReleases());
  assert.equal(beforePublish.some((r) => r.version === '4.3.1'), false);

  // 2. After CLI publishes 4.3.1 in D1, API returns 4.3.1 as published -> overrides built-in draft
  const apiPublished431: ReleaseEntry = {
    ...RELEASES_CATALOG.find((r) => r.version === '4.3.1')!,
    publicationStatus: 'published',
    publishedAt: '2026-11-27',
  };
  const afterPublish = mergeReleaseCatalogs([apiPublished431, ...getPublishedReleases()], getPublishedReleases());
  assert.equal(afterPublish[0]?.version, '4.3.1');
  assert.equal(afterPublish[0]?.publicationStatus, 'published');

  // 3. Offline restart: cached published catalog (afterPublish) merged with built-in (where 4.3.1 is still draft)
  //    MUST preserve 4.3.1 as published and never revert it to draft!
  const offlineReload = mergeReleaseCatalogs(afterPublish, getPublishedReleases());
  assert.equal(offlineReload[0]?.version, '4.3.1');
  assert.equal(offlineReload[0]?.publicationStatus, 'published');

  // 4. Skipped multiple versions (4.0.0 -> 4.3.1): auto-shows ONLY installed 4.3.1, no stacked modals
  const skippedState = computeReleaseViewState({
    catalog: offlineReload,
    installedVersion: '4.3.1',
    lastInstalledVersion: '4.0.0',
    seenReleaseIds: ['rel_4_0_0'],
    isUnconfigured: false,
  });
  assert.equal(skippedState.autoShowRelease?.version, '4.3.1');

  // 5. Server rollback: API stops returning 4.3.1 -> merge drops 4.3.1 and does not advertise rolled-back version
  const afterRollback = mergeReleaseCatalogs(getPublishedReleases(), getPublishedReleases());
  assert.equal(afterRollback[0]?.version, '4.3.0');
  assert.equal(afterRollback.some((r) => r.version === '4.3.1'), false);
});

test('Service Worker notificationclick posts OPEN_DEEP_LINK to open client, opens window on cold start, and rejects cross-origin URLs', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const swSource = fs.readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

  const listeners = new Map<string, (ev: unknown) => void>();
  const postedMessages: unknown[] = [];
  const openedWindows: string[] = [];
  let mockClients: Array<{ focus: () => Promise<void>; postMessage: (msg: unknown) => void }> = [];

  const sandbox = {
    URL,
    Response,
    Set,
    Promise,
    self: {
      location: { origin: 'https://uni-schedule-opal.vercel.app' },
      addEventListener: (name: string, fn: (ev: unknown) => void) => listeners.set(name, fn),
      clients: {
        matchAll: async () => mockClients,
        openWindow: async (url: string) => {
          openedWindows.push(url);
        },
      },
      registration: { active: true, showNotification: async () => {} },
      skipWaiting: async () => {},
    },
    caches: { open: async () => ({ match: async () => null, put: async () => {} }), keys: async () => [], delete: async () => true },
  };
  vm.runInNewContext(swSource, sandbox);

  const handler = listeners.get('notificationclick');
  assert.ok(handler, 'notificationclick listener must be registered in sw.js');

  const dispatchClick = async (rawUrl: string) => {
    let p: Promise<unknown> = Promise.resolve();
    handler!({
      notification: { close: () => {}, data: { url: rawUrl } },
      waitUntil: (promise: Promise<unknown>) => {
        p = promise;
      },
    });
    await p;
  };

  // Case 1: Already-open window receives same-origin OPEN_DEEP_LINK postMessage
  mockClients = [{ focus: async () => {}, postMessage: (msg) => postedMessages.push(msg) }];
  await dispatchClick('/?view=release&version=4.3.0');
  assert.deepEqual(JSON.parse(JSON.stringify(postedMessages)), [
    { type: 'OPEN_DEEP_LINK', url: '/?view=release&version=4.3.0' },
  ]);

  // Case 2: Cross-origin URL is sanitized to '/' (no OPEN_DEEP_LINK sent to evil origin)
  postedMessages.length = 0;
  await dispatchClick('https://evil.example/?view=release&version=4.3.0');
  assert.equal(postedMessages.length, 0);

  // Case 3: Cold launch (no open clients) calls clients.openWindow with same-origin deep link
  mockClients = [];
  await dispatchClick('/?view=release&version=4.3.0');
  assert.deepEqual(openedWindows, ['/?view=release&version=4.3.0']);
});
