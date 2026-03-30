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

Important: the workflow lives on `master`, but it updates `main`.

## Recommended Flow

### 1. Let automation update `main`

In normal operation, the GitHub Actions workflow updates `origin/main` every morning.

If needed, you can also trigger `sync-upstream` manually from the GitHub Actions page.

### 2. Bring upstream changes into `dev`

```bash
git checkout dev
git pull origin dev
git merge main
```

Resolve conflicts in `dev`, not in `master`.

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

Only validated `master` commits should produce release assets.

## Local Sync Commands

If you want to sync the local upstream mirror branch manually:

```bash
git checkout main
git pull
git push
```

This repository should be configured so that on `main`:

- `git pull` pulls from `upstream/main`
- `git push` pushes to `origin/main`

## Relationship To The Backend Repository

- This repository produces `management.html`.
- The backend repository downloads and serves that file through `remote-management.panel-github-repository`.
- If the backend fork defaults to your frontend fork, this repository's releases become the real source of `/management.html`.

## Rules Of Thumb

- Do not develop directly on `main`.
- Do not use `master` for unfinished work.
- Publish `management.html` releases only from `master`.
- Keep `feature/*` branches short-lived.
- Treat `master` as "validated frontend state", not "latest upstream state".
