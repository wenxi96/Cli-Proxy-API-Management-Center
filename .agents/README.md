# Agents Workspace

Persistence Mode: git-visible

This directory is the project-local persistent workspace for agent handoff, repository governance, and reusable repository context.

## Canonical Workspace

- Canonical `.agents` path: `.agents/`
- Current execution surface: main worktree
- Active task pointer: `tasks/20260629-auth-file-quota-display-unification/task.md`

## Active Tasks

- `tasks/20260629-auth-file-quota-display-unification/`: direct_inline 任务，统一认证文件「单文件刷新额度」与「批量检查概览卡片」两处入口的额度展示（渲染层统一、A 对齐 B、provider 特有信息保留）；计划已落地，待批准进入实现。
- `tasks/20260626-frontend-upstream-v1-17-7/`: frontend-owned task for absorbing `upstream/main@acf432b` / `v1.17.7` with fork customizations preserved; completed with `dev@1ff3f56`, `master@8f9eda1`, and release tag `v1.17.7-wx-2.7`.
- `tasks/20260612-sync-upstream-v7-fork-customizations/`: historical frontend reference for the previous cross-repository canonical plan stored in `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/`.
- `tasks/20260527-sync-upstream/`: historical predecessor for upstream sync from `upstream/main@87702bb`; superseded by the 2026-06-12 cross-repository task and no longer the execution authority.

## Registry

- `registry/repo-overview.md`: high-level repository facts, scope, entry points, and unknowns.
- `registry/repo-map.md`: structured map of important paths.
- `registry/execution-surface.md`: commands and runnable surfaces discovered from repository evidence.
- `registry/verification-commands.md`: verification command tiers derived from the command surface.
- `registry/index-manifest.json`: machine-readable freshness fingerprint and coverage summary.

## Directory Roles

- `registry/`: stable repository context and indexes.
- `tasks/`: active task directories when a task needs persistent state.
- `workers/`: worker-local scratch. Contents are ignored by default.
- `reports/`: repository-level audit or review reports.
- `scratch/`: temporary outputs. Contents are ignored by default.
- `archive/`: completed or inactive task archives.

## Local Conventions

- Repository-specific rules currently exist in `CLAUDE.md`; this file is ignored by `.gitignore`, so stable team-facing rules should be mirrored into tracked governance docs when they need to travel with the repository.
- Fork customizations listed in `CLAUDE.md` must be preserved during upstream sync work.
- Do not store secrets, management keys, tokens, cookies, or raw private config values under `.agents/`.
