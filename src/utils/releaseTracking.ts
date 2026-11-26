import {
  INSTALLED_APP_VERSION,
  compareSemver,
  getLatestPublishedRelease,
  getPublishedReleases,
  getReleaseByVersion,
  isValidSemver,
  type ReleaseEntry,
} from '../data/releases';
import { readStorage, writeStorage } from './storage';

const SEEN_RELEASES_KEY = 'uni_schedule_seen_releases_v1';
const LAST_INSTALLED_VERSION_KEY = 'uni_schedule_last_installed_version_v1';
const CACHED_RELEASES_KEY = 'uni_schedule_cached_releases_v1';

export interface ReleaseViewState {
  installedVersion: string;
  latestPublishedRelease: ReleaseEntry | null;
  installedRelease: ReleaseEntry | null;
  seenReleaseIds: string[];
  /** True when a newer published release exists beyond the installed frontend bundle. */
  hasAvailableUpdate: boolean;
  /** True when the installed release has notes that the user hasn't viewed yet. */
  hasUnreadInstalledRelease: boolean;
  /** Release to show automatically after an actual upgrade (never on first-time onboarding). */
  autoShowRelease: ReleaseEntry | null;
}

export function readSeenReleaseIds(): string[] {
  const raw = readStorage<unknown>(SEEN_RELEASES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))
  ).slice(0, 100);
}

export function markReleaseSeen(releaseId: string): string[] {
  const current = readSeenReleaseIds();
  if (current.includes(releaseId)) return current;
  const next = [...current, releaseId].slice(-100);
  writeStorage(SEEN_RELEASES_KEY, next);
  return next;
}

export function readLastInstalledVersion(): string | null {
  const raw = readStorage<unknown>(LAST_INSTALLED_VERSION_KEY, null);
  return typeof raw === 'string' && isValidSemver(raw) ? raw : null;
}

export function writeLastInstalledVersion(version: string): void {
  if (isValidSemver(version)) {
    writeStorage(LAST_INSTALLED_VERSION_KEY, version);
  }
}

export function readCachedReleases(): ReleaseEntry[] | null {
  const raw = readStorage<unknown>(CACHED_RELEASES_KEY, null);
  if (!Array.isArray(raw)) return null;
  const valid = raw.filter(
    (item): item is ReleaseEntry =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as ReleaseEntry).id === 'string' &&
      typeof (item as ReleaseEntry).version === 'string' &&
      isValidSemver((item as ReleaseEntry).version) &&
      typeof (item as ReleaseEntry).ukTitle === 'string'
  );
  return valid.length > 0 ? valid : null;
}

export function writeCachedReleases(releases: readonly ReleaseEntry[]): void {
  if (releases.length > 0) {
    writeStorage(CACHED_RELEASES_KEY, releases);
  }
}

/**
 * Merges remote published releases with the built-in offline catalog,
 * deduplicating by `version` (remote wins) and sorting newest-first by SemVer.
 */
export function mergeReleaseCatalogs(
  remote: readonly ReleaseEntry[] | null | undefined,
  builtin: readonly ReleaseEntry[] = getPublishedReleases()
): ReleaseEntry[] {
  const byVersion = new Map<string, ReleaseEntry>();
  for (const r of builtin) {
    if (r.publicationStatus === 'published') {
      byVersion.set(r.version, r);
    }
  }
  if (remote) {
    for (const r of remote) {
      if (r.publicationStatus === 'published' && isValidSemver(r.version)) {
        byVersion.set(r.version, r);
      }
    }
  }
  return Array.from(byVersion.values()).sort((a, b) => compareSemver(b.version, a.version));
}

/**
 * Computes the complete release awareness state:
 * - Never claims "You updated to X" when `installedVersion < X`
 * - Never auto-opens What's New for a brand-new user in onboarding (`isUnconfigured`)
 * - Handles rollback safely: returning to an older version never re-triggers already-seen releases
 */
export function computeReleaseViewState(params: {
  catalog: readonly ReleaseEntry[];
  installedVersion?: string;
  lastInstalledVersion: string | null;
  seenReleaseIds: readonly string[];
  isUnconfigured: boolean;
}): ReleaseViewState {
  const installedVersion = params.installedVersion ?? INSTALLED_APP_VERSION;
  const published = getPublishedReleases(params.catalog);
  const latestPublishedRelease = getLatestPublishedRelease(published);
  // Installed release may be published OR the currently running release candidate
  const installedRelease =
    getReleaseByVersion(installedVersion, { includeDraft: false, catalog: published }) ??
    getReleaseByVersion(installedVersion, { includeDraft: true, catalog: params.catalog });

  const hasAvailableUpdate = Boolean(
    latestPublishedRelease && compareSemver(latestPublishedRelease.version, installedVersion) > 0
  );

  const seenSet = new Set(params.seenReleaseIds);
  const isUpgradedFromOlder = Boolean(
    params.lastInstalledVersion &&
      compareSemver(installedVersion, params.lastInstalledVersion) > 0
  );

  // Only published releases matching the actually installed version qualify for automatic "What's New"
  const installedIsPublished = installedRelease?.publicationStatus === 'published';
  const hasUnreadInstalledRelease = Boolean(
    installedRelease && installedIsPublished && !seenSet.has(installedRelease.id)
  );

  const autoShowRelease =
    !params.isUnconfigured &&
    isUpgradedFromOlder &&
    hasUnreadInstalledRelease &&
    installedRelease
      ? installedRelease
      : null;

  return {
    installedVersion,
    latestPublishedRelease,
    installedRelease,
    seenReleaseIds: [...params.seenReleaseIds],
    hasAvailableUpdate,
    hasUnreadInstalledRelease,
    autoShowRelease,
  };
}

/**
 * Safely parses a same-origin deep link query string such as `/?view=release&version=4.3.0`.
 * Rejects arbitrary external URLs and invalid SemVer strings.
 */
export function parseReleaseDeepLink(search: string): { version?: string; openHistory?: boolean } | null {
  try {
    const params = new URLSearchParams(search);
    const view = params.get('view');
    if (view === 'release-history') {
      return { openHistory: true };
    }
    if (view !== 'release') return null;
    const rawVersion = params.get('version')?.trim().replace(/^v/i, '') ?? '';
    if (!rawVersion) return {};
    if (!isValidSemver(rawVersion)) return {};
    return { version: rawVersion };
  } catch {
    return null;
  }
}
