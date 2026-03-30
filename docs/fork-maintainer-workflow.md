# Fork Maintainer Workflow

This frontend fork uses the same layered branch model as the backend so upstream sync, UI development, and `management.html` release publishing stay separate.

## Branch Roles

- `main`: upstream mirror branch. Keep this branch aligned with `upstream/main`.
- `master`: stable fork branch and the default branch on GitHub for this fork.
- `dev`: integration branch for upstream updates and completed UI work.
- `feature/*`: short-lived development branches created from `dev`.

## Why This Model Exists

This setup separates four concerns:

1. What upstream shipped
2. What the fork considers stable
3. What is currently being integrated
4. What is still under active development

That keeps `main` clean and ensures only validated UI builds become published `management.html` release assets.

## Daily Upstream Sync

The default branch `master` contains the workflow file `.github/workflows/sync-upstream.yml`.

That workflow:

- runs every day at 09:17 Asia/Shanghai / Asia/Hong_Kong time
- supports manual `workflow_dispatch`
- syncs `origin/main` from `upstream/main`
- only allows fast-forward updates
- fails instead of overwriting fork-only commits on `main`
- if you protect `main`, allow the GitHub Actions bot to write or bypass; otherwise `sync-upstream` will fail

Important: the workflow lives on `master`, but it updates `main`.

## Recommended Flow

### 1. Let automation update `main`

In normal operation, the GitHub Actions workflow updates `origin/main` every morning.

If needed, you can also trigger `sync-upstream` manually from the GitHub Actions page.

### 2. Bring upstream changes into `dev`

```bash
git fetch origin main
git checkout dev
git pull origin dev
git merge --ff-only origin/main
```

Resolve conflicts in `dev`, not in `master`.
This avoids merging a stale local `main` into `dev`.

### 3. Start new UI work from `dev`

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-ui-change
```

### 4. Merge feature work back into `dev`

```bash
git checkout dev
git merge feature/my-ui-change
git push origin dev
```

### 5. Promote validated work to `master`

```bash
git checkout master
git pull origin master
git merge dev
git push origin master
```

### 6. Publish releases only from `master`

```bash
git checkout master
git pull origin master
git tag v2026.03.30-fork.1
git push origin v2026.03.30-fork.1
```

Only create release tags from validated `master` commits.
The current release workflow still triggers on any `v*` tag, so this rule is enforced by maintainer discipline rather than workflow guards.

## Local Sync Commands

If you want to sync the local upstream mirror branch manually:

```bash
git checkout main
git fetch upstream main
git merge --ff-only upstream/main
git push origin main
```

These commands do not depend on extra branch-specific git configuration.
If you want bare `git pull` to track `upstream/main`, you must configure `branch.main.remote` and `branch.main.merge` manually.

## Relationship To The Backend Repository

- This repository produces `management.html`.
- The backend repository downloads and serves that file through `remote-management.panel-github-repository`.
- If the backend fork defaults to your frontend fork, this repository's releases become the real source of `/management.html`.

## Rules Of Thumb

- Do not develop directly on `main`.
- Do not use `master` for unfinished work.
- Create release tags only from validated `master` commits.
- The release workflow still triggers on any `v*` tag, so this rule depends on maintainer discipline.
- Keep `feature/*` branches short-lived.
- Treat `master` as "validated frontend state", not "latest upstream state".
