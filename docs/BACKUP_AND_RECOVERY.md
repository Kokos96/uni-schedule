# Backup and Recovery Guide — uni-schedule 2.0

This document records the Phase Zero backup inventory, verification commands, and non-destructive recovery procedures for the `uni-schedule` (`rozklad`) project prior to the `uni-schedule 2.0` redesign.

---

## 1. Verified Pre-Redesign Baseline

| Item | Verified Value |
| --- | --- |
| **WSL Project Path** | `/home/kostia/projects/rozklad` |
| **Windows UNC Path** | `\\wsl.localhost\Ubuntu\home\kostia\projects\rozklad` |
| **Backup Directory** | `/home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign` |
| **GitHub Remote** | `https://github.com/Kokos96/uni-schedule.git` (`origin`: `git@github.com:Kokos96/uni-schedule.git`) |
| **Baseline Commit (`ORIGINAL_HEAD`)** | `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` (short: `8b6aa9a`) |
| **Baseline Commit Subject** | `fix: remove node_modules from repository and update gitignore` |
| **Backup Branch (Local & GitHub)** | `backup/pre-uni-schedule-2.0` -> `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` |
| **Production Branch (`main`)** | `main` -> `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea` |
| **Active Redesign Branch** | `redesign/uni-schedule-2.0` (branched from `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`) |

---

## 2. Backup Directory Inventory

Location: `/home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/`

| Artifact | Size / Type | Purpose & Verified Contents |
| --- | --- | --- |
| `ORIGINAL_HEAD.txt` | 41 B (file) | Exact pre-redesign commit hash: `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`. |
| `uni-schedule-pre-redesign.bundle` | 7,226,512 B (git bundle) | Complete self-contained Git history (`sha1`), verified via `git bundle verify`. Contains 4 refs all at `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`: `refs/heads/backup/pre-uni-schedule-2.0`, `refs/heads/main`, `refs/remotes/origin/main`, and `HEAD`. |
| `snapshot/` | Directory | Full pre-redesign working tree snapshot: `.gitignore`, `dist/`, `index.html`, `package-lock.json`, `package.json`, `postcss.config.js`, `public/`, `src/`, `tailwind.config.js`, `tsconfig.json`, `vite.config.ts`. |
| `config-and-pwa/` | Directory | Isolated copy of build/config and PWA assets: `.gitignore`, `index.html`, `package-lock.json`, `package.json`, `postcss.config.js`, `public/` (`icons/`, `manifest.json`), `tailwind.config.js`, `tsconfig.json`, `vite.config.ts`. |
| `branches.txt` | 214 B (file) | Snapshot of local branches before redesign (`backup/pre-uni-schedule-2.0`, `main`). |
| `git-status.txt` | 0 B (file) | Empty — confirms clean working tree at backup time. |
| `staged.patch` | 0 B (file) | Empty — confirms no staged uncommitted diffs at backup time. |
| `uncommitted-tracked.patch` | 0 B (file) | Empty — confirms no unstaged tracked diffs at backup time. |

---

## 3. Verification Commands

Run these commands inside WSL to confirm backup integrity and branch alignment at any time:

```bash
# 1. Verify baseline hash file and backup directory contents
ls -la /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/
cat /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/ORIGINAL_HEAD.txt
# Expected: 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea

# 2. Verify Git bundle integrity and included refs
cd /home/kostia/projects/rozklad
git bundle verify /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle

# 3. Verify local branches and active branch
git status -sb
git branch -vv
git show-ref

# 4. Verify GitHub remote refs (read-only over HTTPS)
GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/Kokos96/uni-schedule.git
# Expected refs/heads/backup/pre-uni-schedule-2.0 -> 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea
```

---

## 4. Recovery Procedures

> [!IMPORTANT]
> **Safety Rules:**
> - Never delete or overwrite `/home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/`.
> - Never delete the `backup/pre-uni-schedule-2.0` branch locally or on GitHub.
> - Never use `git push --force` or `git push -f`.
> - Never print, copy into git-tracked files, or commit `.env*` secrets, tokens, or SSH keys.

### 4.1 Recover a Clean Local Copy from the Git Bundle

Use this if `/home/kostia/projects/rozklad` is damaged or you want an isolated clean workspace from the exact Phase Zero state:

```bash
# Clone into a new directory without touching the backup or existing workspace
git clone \
  /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle \
  /home/kostia/projects/rozklad-recovered

cd /home/kostia/projects/rozklad-recovered
git checkout -b recovery/from-bundle 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea
git rev-parse HEAD
# Expected: 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea

# Re-attach GitHub origin if needed
git remote set-url origin git@github.com:Kokos96/uni-schedule.git

# Install dependencies and verify build
npm ci
npm run build
```

### 4.2 Restore Missing Baseline Objects into the Existing Repository

Use this if local Git history in `/home/kostia/projects/rozklad` lost the backup branch or objects:

```bash
cd /home/kostia/projects/rozklad

# Verify bundle first
git bundle verify /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle

# Fetch backup branch from bundle into a non-destructive recovery ref
git fetch \
  /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/uni-schedule-pre-redesign.bundle \
  refs/heads/backup/pre-uni-schedule-2.0:refs/heads/backup/pre-uni-schedule-2.0

git rev-parse backup/pre-uni-schedule-2.0
# Expected: 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea
```

### 4.3 Recover from GitHub Backup Branch

If local backups are unavailable on a machine, restore from the remote `backup/pre-uni-schedule-2.0` branch:

```bash
git clone https://github.com/Kokos96/uni-schedule.git /home/kostia/projects/rozklad-gh-recovery
cd /home/kostia/projects/rozklad-gh-recovery
git checkout -b recovery/pre-uni-schedule-2.0 origin/backup/pre-uni-schedule-2.0
git rev-parse HEAD
# Expected: 8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea

npm ci
npm run build
```

### 4.4 File-Level Recovery from `snapshot/` or `config-and-pwa/`

If only specific config, PWA, or source files need inspection or restoration without altering Git branches:

```bash
cd /home/kostia/projects/rozklad

# Compare current files against the pre-redesign snapshot
diff -ru \
  --exclude=node_modules --exclude=.git --exclude=dist \
  /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/snapshot \
  /home/kostia/projects/rozklad

# Example: restore PWA manifest and config files safely by copying (creates tracked changes you can review with git diff)
cp /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/config-and-pwa/public/manifest.json \
  /home/kostia/projects/rozklad/public/manifest.json
cp /home/kostia/projects/rozklad-backups/uni-schedule-pre-redesign/config-and-pwa/vite.config.ts \
  /home/kostia/projects/rozklad/vite.config.ts

git status
git diff
```

---

## 5. Secrets & Environment Hygiene

- No `.env` files were present or tracked at commit `8b6aa9aa9c69ee95eb27d7d65f092533a9e815ea`.
- If environment variables are configured in Vercel or added locally during `uni-schedule 2.0` development:
  - Keep local secrets in `.env.local` (never committed to Git).
  - Manage production/preview environment variables strictly through the Vercel Dashboard (`Project Settings -> Environment Variables`).
  - Never record secret values in backup snapshots, patches, or documentation.
