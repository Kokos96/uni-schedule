# Deployment Guide — `uni-schedule 2.0`

This document describes the build pipeline, Vercel hosting configuration, HTTP caching & SPA rewrite rules, and post-deploy verification steps for **uni-schedule 2.0** (`Розклад ФЕП-33с`).

---

## 1. Repository & Hosting Topology

| Component | Observed Configuration |
| :--- | :--- |
| **GitHub Repository** | `https://github.com/Kokos96/uni-schedule.git` (`origin`: `git@github.com:Kokos96/uni-schedule.git`) |
| **Production Branch** | `main` |
| **Backup Branch** | `backup/pre-uni-schedule-2.0` (`8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`) |
| **Redesign Branch** | `redesign/uni-schedule-2.0` |
| **Hosting Provider** | Vercel (GitHub App integration via `vercel[bot]`) |
| **Deployment Trigger** | Automatic **Production** build on push/merge to `main`; **Preview** build on pull requests / feature branches |

### Observed GitHub Deployments

Querying the GitHub Deployments API (`GET /repos/Kokos96/uni-schedule/deployments`) shows two Vercel production environments linked to this repository, both auto-deployed by `vercel[bot]` from `main` (most recent remote production SHA: `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`, status `success`):

1. **`Production – uni-schedule`**
   - Latest observed GitHub Deployment ID: `6253151108` (`2026-09-03T21:22:43Z`)
   - Observed deployment URL: `https://uni-schedule-bbehpqlfo-kokos96.vercel.app`
2. **`Production – uni-schedule-j7r1`**
   - Latest observed GitHub Deployment ID: `6253154290` (`2026-09-03T21:22:55Z`)
   - Observed deployment URL: `https://uni-schedule-j7r1-em6fn68a7-kokos96.vercel.app`

> [!NOTE]
> **CLI Availability in WSL:** Neither `gh` (GitHub CLI) nor `vercel` (Vercel CLI) is installed in the current WSL environment (`which gh vercel` returns empty). Production deployments are triggered automatically through the GitHub-to-Vercel integration when changes are merged and pushed to `main`, and deployment logs/promotions/instant rollbacks are managed in the Vercel Dashboard.

---

## 2. Build Configuration & Output

Configured in `package.json` and `vite.config.ts` (static Vite + React + TypeScript SPA, no server-side runtime or required build-time secrets):

| Setting | Value | Source |
| :--- | :--- | :--- |
| **Framework Preset** | Vite | `vite.config.ts` |
| **Install Command** | `npm ci` | `package-lock.json` |
| **Build Command** | `tsc --noEmit && vite build` (`npm run build`) | `package.json` |
| **Typecheck Command** | `tsc --noEmit` (`npm run typecheck`) | `package.json`, `tsconfig.json` |
| **Output Directory** | `dist` | Vite default |
| **Manual Vendor Chunks** | `react-vendor` (`react`, `react-dom`), `motion-vendor` (`framer-motion`) | `vite.config.ts` |

### Local Production Build Verification (`2026-11-13`)

Running `npm run build` (`tsc --noEmit && vite build`) completed with exit code `0` in `3.94s` (`1980` modules transformed) and generated `dist/` containing:
- `dist/index.html` (`4.62 kB` | gzip `1.66 kB`)
- `dist/manifest.json` (`991 B`)
- `dist/sw.js` (`5,643 B`)
- `dist/offline.html` (`3,208 B`)
- `dist/favicon.ico` (`5,871 B`)
- `dist/icons/` (`apple-touch-icon.png`, `favicon-32x32.png`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `icon-1024.png`, `icon-maskable-512.png`)
- `dist/assets/` (content-hashed `.css` and lazy-loaded `.js` chunks, including `react-vendor`, `motion-vendor`, `StatsView`, `SettingsView`, `DeadlinesView`, `DirectoryView`, `LessonNotesDrawer`, `WeekGrid`, and `ModalDrawer`)

---

## 3. `vercel.json` Caching & SPA Routing

`vercel.json` configures strict cache semantics for PWA updates and long-term immutable caching for Vite's hashed bundles, while preventing SPA rewrites from returning HTML for missing static assets.

### 3.1 HTTP Response Headers

| Route Pattern | Header | Value | Purpose |
| :--- | :--- | :--- | :--- |
| `/sw.js` | `Cache-Control` | `no-cache, no-store, must-revalidate` | Forces browsers to revalidate the Service Worker script on every check (`updateViaCache: 'none'` in `index.html`). |
| `/sw.js` | `Service-Worker-Allowed` | `/` | Permits root scope `/` registration. |
| `/manifest.json` | `Cache-Control` | `public, max-age=0, must-revalidate` | Ensures PWA metadata and icon updates propagate without stale caching. |
| `/manifest.json` | `Content-Type` | `application/manifest+json; charset=utf-8` | Serves the Web App Manifest with the standard MIME type. |
| `/offline.html` | `Cache-Control` | `public, max-age=0, must-revalidate` | Ensures the fallback offline shell stays current on revalidation. |
| `/icons/(.*)` | `Cache-Control` | `public, max-age=604800, stale-while-revalidate=86400` | Caches PWA icons for 7 days with 24-hour stale-while-revalidate. |
| `/assets/(.*)` | `Cache-Control` | `public, max-age=31536000, immutable` | Caches content-hashed Vite JS/CSS bundles for 1 year safely. |

### 3.2 SPA Fallback Rewrite

```json
{
  "source": "/((?!icons/|assets/|sw\\.js|manifest\\.json|offline\\.html|favicon\\.ico).*)",
  "destination": "/index.html"
}
```

- Routes client-side paths to `/index.html`.
- Explicitly excludes `icons/`, `assets/`, `sw.js`, `manifest.json`, `offline.html`, and `favicon.ico` so missing static or chunk paths return a clean `404` instead of serving `index.html` with `text/html` MIME type.

---

## 4. Standard Release & Deployment Workflow

1. **Pre-merge checks (local):**
   - Confirm clean git working tree and run `npm run build` (`tsc --noEmit && vite build`).
   - Run unit and E2E verification (`tests/unit/domain.test.ts` and `tests/e2e/verify_app.py`) against the built `dist/` preview server.
2. **Merge to `main`:**
   - Merge `redesign/uni-schedule-2.0` into `main` via Pull Request (or fast-forward/merge commit on `main`) and push to `origin/main` without `--force`.
   - Tag the release commit `v2.0.0` (annotated tag) and push tags if maintaining GitHub Releases.
3. **Automatic Vercel Build:**
   - Vercel's GitHub integration detects the push to `main`, executes `tsc --noEmit && vite build`, deploys `dist/`, and updates both `Production – uni-schedule` and `Production – uni-schedule-j7r1` (or the active production project domains configured in Vercel).
4. **Verify deployment status:**
   - Confirm both GitHub deployment statuses and the Vercel Dashboard show **Ready** / `success` for the new `main` commit SHA.

---

## 5. Post-Deploy Verification Checklist

Run these checks against each production URL immediately after deployment:

### 5.1 Edge Headers & Static Assets
- [ ] `GET /` returns HTTP `200` and renders the Graphite Glass shell (`<html lang="uk">`).
- [ ] `GET /sw.js` returns HTTP `200` with `Cache-Control: no-cache, no-store, must-revalidate` and `Service-Worker-Allowed: /`.
- [ ] `GET /manifest.json` returns HTTP `200` with `Content-Type: application/manifest+json; charset=utf-8` and `Cache-Control: public, max-age=0, must-revalidate`.
- [ ] `GET /offline.html` returns HTTP `200`.
- [ ] `GET /assets/<main-bundle>.js` returns HTTP `200` with `Cache-Control: public, max-age=31536000, immutable`.
- [ ] `GET /assets/nonexistent.js` returns HTTP `404` (NOT `200` with `index.html`).
- [ ] `GET /icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-512.png`, `/icons/apple-touch-icon.png`, `/icons/favicon-32x32.png`, `/icons/favicon.ico` all return HTTP `200`.

### 5.2 PWA, Service Worker & Offline Behavior
- [ ] Browser DevTools -> **Application** -> **Manifest** reports zero errors, valid `192x192`, `512x512`, `1024x1024`, and `maskable` icons, and `start_url: "/"`.
- [ ] **Service Workers** shows `/sw.js` activated and controlling `/` (`rozklad-shell-v2` / `rozklad-assets-v2` caches populated).
- [ ] Switching DevTools Network to **Offline** and reloading `/` serves the cached app shell and offline banner (`Офлайн-режим: розклад і нотатки доступні локально`).
- [ ] Uncached navigation while offline falls back cleanly to `/offline.html`.
- [ ] Updating from a prior SW version surfaces the controlled update prompt (`SKIP_WAITING`) rather than abruptly reloading mid-input.

### 5.3 Functional, Theme & Responsive Smoke Test
- [ ] **Existing User Data Compatibility:** Pre-existing `uni_schedule_attendance_v1` and `uni_schedule_settings_v2` entries in `localStorage` load intact with zero data loss.
- [ ] **Themes:** Switching between Dark (`#242522`), Light (`#F2F0EB`), and System themes updates `data-theme` and persists across reload without flash of wrong theme (handled by inline boot script in `index.html`).
- [ ] **Desktop (`1280px+`):** `SidebarNav` renders on the left, Day/Week switcher toggles between the 2-column Day Dashboard and 5-column `WeekGrid`, and keyboard shortcuts (`1`–`5`) navigate tabs.
- [ ] **Mobile (`320px–430px`):** `BottomNav` renders cleanly without horizontal overflow, horizontal swipe switches days, and `LessonNotesDrawer` opens as a bottom sheet.
- [ ] **JSON Backup:** Exporting a v2 JSON backup downloads a valid `schemaVersion: 2` payload; importing in preview/merge mode preserves existing data safely.

---

## 6. Rollback Reference

If a production deployment exhibits regressions or broken assets, follow [`docs/ROLLBACK.md`](./ROLLBACK.md):
- **Immediate mitigation:** Use Vercel Dashboard -> **Deployments** -> **Instant Rollback** to the prior healthy production deployment (`8b6aa9a`).
- **Git alignment:** Create a forward-commit revert branch to `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` and merge to `main` without `git push --force`.
