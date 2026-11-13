# Rollback Runbook — uni-schedule 2.0

This runbook defines safe, non-destructive procedures to roll back `uni-schedule` (`rozklad`) to the verified pre-redesign Phase Zero state (`8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`) locally, on GitHub, and on Vercel.

---

## 1. Rollback Reference Values

| Reference | Verified Value |
| --- | --- |
| **Target Rollback Commit** | `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` (`8b6aa9a`) |
| **Commit Message** | `fix: remove node_modules from repository and update gitignore` |
| **Protected Backup Branch** | `backup/pre-uni-schedule-2.0` (local + `origin/backup/pre-uni-schedule-2.0`) |
| **Production Branch** | `main` |
| **Active Redesign Branch** | `redesign/uni-schedule-2.0` |
| **GitHub Repository** | `https://github.com/Kokos96/uni-schedule.git` |
| **Local Repo Path (WSL)** | `/home/kostia/projects/rozklad` |
| **Verified Local Bundle** | `/home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle` |

---

## 2. Mandatory Non-Destructive Rules

1. **Never force-push (`git push --force` / `git push -f`)** to `main`, `backup/pre-uni-schedule-2.0`, or shared branches. Roll back `main` using forward commits (`git revert` or restoring tree state onto a new commit) so history stays linear and auditable.
2. **Never delete backups**: keep `/home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/` and `backup/pre-uni-schedule-2.0` intact.
3. **Preserve in-progress work first**: before rolling back locally, save any uncommitted or experimental redesign commits to a timestamped branch or patch outside the repo.
4. **Never expose secrets**: do not print or commit `.env*` files, tokens, or SSH private keys.

---

## 3. Pre-Rollback Preservation Step (Local)

Before performing any local or remote rollback, preserve your current working state:

```bash
cd /home/kostia/projects/rozklad

# 1. Inspect current state
git status -sb
git log -n 5 --oneline --decorate

# 2. Save any uncommitted changes onto a preservation branch (if working tree is dirty)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
git branch "archive/pre-rollback-${TIMESTAMP}"
git status --short

# If there are uncommitted changes you want to keep before switching:
# git switch -c "wip/pre-rollback-${TIMESTAMP}"
# git add -A && git commit -m "wip: preserve state before rollback (${TIMESTAMP})"
```

---

## 4. Scenario A — Roll Back Locally to Pre-Redesign State

### Option A1: Switch to a Clean Working Branch at `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`

Best when you want to test, build, or run the pre-redesign app without modifying `redesign/uni-schedule-2.0`:

```bash
cd /home/kostia/projects/rozklad

# Create a clean branch directly from the protected backup branch
git switch -c rollback/verify-pre-redesign backup/pre-uni-schedule-2.0

# Verify exact commit
git rev-parse HEAD
# Expected: 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea

# Clean build verification
npm ci
npm run build
```

### Option A2: Revert Specific Redesign Commits on `redesign/uni-schedule-2.0`

Best when `redesign/uni-schedule-2.0` has commits you want to undo while keeping commit history:

```bash
cd /home/kostia/projects/rozklad
git switch redesign/uni-schedule-2.0

# Option 1: Revert a single bad commit
git revert <bad-commit-sha>

# Option 2: Revert all redesign commits since 8b6aa9a into one clean rollback commit
git revert --no-commit 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea..HEAD
git commit -m "revert: restore pre-uni-schedule-2.0 baseline (8b6aa9a)"

# Verify build
npm ci
npm run build
```

---

## 5. Scenario B — Roll Back GitHub `main` Without Force-Pushing

Use this if `uni-schedule 2.0` changes have already been merged/pushed to `origin/main` and production must return to the `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` codebase without rewriting Git history.

```bash
cd /home/kostia/projects/rozklad

# 1. Fetch latest remote refs
git fetch origin

# 2. Create a rollback branch from up-to-date origin/main
git switch -c rollback/restore-8b6aa9a origin/main

# 3. Verify backup target commit is present
git cat-file -t 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea
# Expected: commit

# 4. Replace tracked working tree files with exact state of 8b6aa9a (no history rewrite)
git checkout 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea -- .

# 5. Remove any extra tracked files added after 8b6aa9a so tree matches 8b6aa9a exactly
git diff --name-only --diff-filter=A 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea HEAD | xargs -r git rm -f

# 6. Verify zero diff against 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea
git diff --exit-code 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea

# 7. Run local build check before committing
npm ci
npm run build

# 8. Commit and push the rollback branch (standard push, NO --force)
git commit -m "revert(main): roll back to pre-uni-schedule-2.0 baseline (8b6aa9a)"
git push -u origin rollback/restore-8b6aa9a
```

Then merge `rollback/restore-8b6aa9a` into `main` via a GitHub Pull Request (or fast-forward merge on `main` and `git push origin main` without `--force`). Merging into `main` automatically triggers a fresh Vercel production deployment matching `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`.

---

## 6. Scenario C — Instant Vercel Production Rollback

If a production deployment on Vercel is broken and you need immediate mitigation while preparing or merging the Git rollback:

### Option C1: Vercel Dashboard (Fastest, Zero Git Changes)

1. Open the Vercel project Dashboard for `uni-schedule`.
2. Navigate to **Deployments**.
3. Locate the last known healthy **Production** deployment built from commit `8b6aa9a` (`fix: remove node_modules from repository and update gitignore`) — or the last healthy deployment before the `2.0` merge.
4. Open the deployment's `...` menu and select **Instant Rollback** (or **Promote to Production**).
5. Confirm the rollback and verify the live production domain loads without console errors or broken assets.
6. Follow up with **Scenario B** so `origin/main` in GitHub matches the rolled-back production state (preventing the next push to `main` from re-introducing the broken build).

### Option C2: Vercel CLI

If `vercel` CLI is authenticated on your machine:

```bash
cd /home/kostia/projects/rozklad

# List recent production deployments (look for the deployment matching 8b6aa9a)
vercel ls

# Roll back production to a verified prior deployment URL/ID
vercel rollback <previous-production-deployment-url-or-id>
```

---

## 7. Scenario D — Emergency Restore from Local Git Bundle

Use this only if `origin/main` was damaged and `backup/pre-uni-schedule-2.0` needs to be restored from offline media:

```bash
# 1. Verify offline bundle integrity
git bundle verify /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle

# 2. Clone from bundle into a clean directory
git clone \
  /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle \
  /home/kostia/projects/rozklad-emergency-restore

cd /home/kostia/projects/rozklad-emergency-restore
git remote set-url origin git@github.com:Kokos96/uni-schedule.git
git fetch origin

# 3. Create a forward-commit rollback branch from origin/main, apply tree of 8b6aa9a, verify build, and push (NO --force)
git switch -c rollback/emergency-8b6aa9a origin/main
git checkout 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea -- .
git diff --name-only --diff-filter=A 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea HEAD | xargs -r git rm -f
npm ci && npm run build
git commit -m "revert(main): emergency restore to 8b6aa9a from offline bundle"
git push -u origin rollback/emergency-8b6aa9a
```

---

## 8. Post-Rollback Verification Checklist

After completing any rollback, verify:

- [ ] `git rev-parse backup/pre-uni-schedule-2.0` still equals `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` locally and on GitHub.
- [ ] `/home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/` and `uni-schedule-pre-redesign.bundle` remain unmodified and pass `git bundle verify`.
- [ ] `npm ci && npm run build` succeeds cleanly and generates `dist/`.
- [ ] `public/manifest.json` and PWA icons load with HTTP 200 on the deployed preview/production URL.
- [ ] Vercel Production deployment status is **Ready** and points to the rolled-back commit/deployment.
- [ ] If a service worker or browser cache is active on client devices, confirm hard-refresh / updated asset hashes serve the restored version.
