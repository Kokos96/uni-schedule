#!/usr/bin/env -S npx tsx
/**
 * Uni Schedule — Release Publication & Notification CLI (Stage E)
 *
 * Defaults to safe `--dry-run` mode (zero DB mutations, zero Push broadcasts).
 * Usage:
 *   npx tsx scripts/publish-release.ts --version=4.3.0 --dry-run
 *   RELEASE_ADMIN_TOKEN=... API_BASE_URL=https://... npx tsx scripts/publish-release.ts --version=4.3.0 --dispatch --dry-run
 *   RELEASE_ADMIN_TOKEN=... API_BASE_URL=https://... npx tsx scripts/publish-release.ts --version=4.3.0 --publish --confirm-live
 */

import {
  buildReleaseNotificationPayload,
  getReleaseByVersion,
  isValidSemver,
} from '../src/data/releases';

function parseArg(prefix: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const hasFlag = (flag: string): boolean => process.argv.includes(flag);

async function main() {
  const rawVersion = parseArg('--version=') ?? '';
  const isDryRun = hasFlag('--dry-run') || !hasFlag('--confirm-live');
  const doPublish = hasFlag('--publish');
  const doUnpublish = hasFlag('--unpublish');
  const doDispatch = hasFlag('--dispatch');
  const rawBatch = parseArg('--batch-size=');
  const batchSize = rawBatch ? Number(rawBatch) : undefined;
  const apiBaseUrl = (parseArg('--api=') ?? process.env.API_BASE_URL ?? '').replace(/\/+$/, '');
  const adminToken = process.env.RELEASE_ADMIN_TOKEN ?? '';

  if (!rawVersion || !isValidSemver(rawVersion)) {
    console.error('ERROR: Provide a valid SemVer via --version=X.Y.Z');
    process.exit(1);
  }

  const release = getReleaseByVersion(rawVersion, { includeDraft: true });
  if (!release) {
    console.error(`ERROR: Release v${rawVersion} not found in src/data/releases.ts`);
    process.exit(1);
  }

  const payload = buildReleaseNotificationPayload(release);
  const summary = {
    mode: isDryRun ? 'DRY_RUN' : 'LIVE',
    version: release.version,
    releaseId: release.id,
    publicationStatus: release.publicationStatus,
    publishedAt: release.publishedAt,
    metadataValid: Boolean(
      release.id &&
        isValidSemver(release.version) &&
        release.ukTitle.trim().length > 0 &&
        release.summary.trim().length > 0 &&
        payload.title.length > 0 &&
        payload.body.length > 0
    ),
    expectedNotificationPayload: payload,
  };

  console.log('=== RELEASE METADATA CHECK ===');
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.metadataValid) {
    console.error('ERROR: Release metadata validation failed.');
    process.exit(1);
  }

  if (!apiBaseUrl) {
    console.log(
      '\nLOCAL_DRY_RUN_OK: No API_BASE_URL provided; verified canonical metadata and notification payload locally without any server mutations.'
    );
    return;
  }

  if (!adminToken) {
    console.error('ERROR: RELEASE_ADMIN_TOKEN environment variable is required for remote API calls.');
    process.exit(1);
  }

  const callAdmin = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      console.error(`ERROR ${res.status} on ${path}:`, JSON.stringify(data));
      process.exit(1);
    }
    return data;
  };

  if (doPublish || doUnpublish) {
    const targetStatus = doUnpublish ? 'draft' : 'published';
    if (isDryRun) {
      console.log(`DRY_RUN: Would POST /api/admin/releases/publish (${targetStatus}) for`, release.version);
    } else {
      const res = await callAdmin('/api/admin/releases/publish', {
        version: release.version,
        publicationStatus: targetStatus,
        publishedAt: targetStatus === 'draft' ? null : (release.publishedAt ?? new Date().toISOString().slice(0, 10)),
        githubReleaseUrl: release.githubReleaseUrl,
      });
      console.log('PUBLISH_RESULT:', JSON.stringify(res, null, 2));
    }
  }

  if (doDispatch || isDryRun) {
    const res = await callAdmin('/api/admin/releases/dispatch', {
      version: release.version,
      dryRun: isDryRun,
      ...(isDryRun ? {} : { confirmLive: true }),
      ...(batchSize !== undefined ? { batchSize } : {}),
    });
    console.log('DISPATCH_RESULT:', JSON.stringify(res, null, 2));
  }
}

void main();
