# Task Reference

## Current Role

This frontend task directory is a lightweight reference to the current cross-repository canonical plan.

## Canonical Authority

- Canonical backend task: `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/`
- Canonical plan: `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/plans/2026-06-12-sync-upstream-v7-fork-customizations-implementation-plan.md`
- Live status: `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/progress.md`
- Handoff: `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/handoff.md`

## Frontend Scope

- Absorb upstream frontend baseline using execution-time freshness. As of 2026-06-23, `origin/main == upstream/main == ed4124ff3b24` / `v1.17.1`, and current `dev@b60462dc1d33` contains that upstream.
- Preserve fork customizations:
  - DisplayName
  - Scoped Pool / Scoped Poll
  - Auth Files batch check
  - Auth Files ZIP download
  - Usage page and usage persistence UI
  - fork tag-only release strategy and version suffix
- Keep `20260527-sync-upstream` as predecessor/reference only.

## Acceptance Pointers

- `bun install --frozen-lockfile` passes.
- `bun run build` passes.
- Usage page displays totals, charts, model/API stats, import/export, 4-language i18n, and mobile layout.
- Frontend routes and API calls match backend `/usage`, `/usage/export`, `/usage/import`, and quota `on-low-quota` endpoints while reading legacy quota config fields when present.
- VisualConfigEditor and config transformers use `auto-disable-auth-file-on-low-quota` as the primary key, read legacy `auto-disable-auth-file-on-zero-quota`, and delete the legacy key when saving YAML.
- Current frontend fork custom inventory: `evidence/fork-custom-feature-inventory-2026-06-23.md`; this file now records each fork feature's purpose, pre-merge baseline signal, current code paths, runtime logic, and preservation status for future upstream-sync comparisons.
- The same inventory also records the baseline reference method and upstream absorption static checklist for latest upstream frontend features.

## Non-Goals

- Do not push branches, create tags, trigger releases, upload `management.html`, or write secrets without explicit user authorization.
- Do not treat the old `20260527-sync-upstream` task as current execution authority.
