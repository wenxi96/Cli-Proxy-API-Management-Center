# Handoff

## Current State

This directory is a frontend-local reference to the cross-repository canonical task in the backend repository.

2026-06-23 fresh fetch status:

- Frontend `origin/main == upstream/main == ed4124ff3b24` / `v1.17.1`.
- Current frontend `dev@b60462dc1d33` contains latest fetched upstream (`git merge-base --is-ancestor upstream/main HEAD` exit `0`).
- `dev...upstream/main --cherry-pick = 65 0`; current merge-tree conflict count is `0`.
- Frontend fork custom inventory is recorded at `evidence/fork-custom-feature-inventory-2026-06-23.md`.
- The inventory has been expanded to include feature purpose, baseline signals, current implementation paths, runtime logic and preservation status for DisplayName, Auth Files batch check, custom filters / compact mode, ZIP download, scoped-pool UI, low-quota naming compatibility, Usage page, tag-only release and Ampcode removal.
- The inventory also includes `Baseline Reference Method` and `Upstream Absorption Static Checklist`, covering upstream plugin pages/store, VisualConfigEditor plugin config, Logs fullscreen/error logs, OAuth excluded UI, xAI/Grok OAuth/quota, Codex websocket controls, and Bun/Node 24 release/rebuild workflow.
- The inventory now includes `Baseline Extraction Evidence`, listing baseline feature file existence, baseline symbol anchors and current quick symbol counts from `backup/pre-merge-2026-06-16-a02ebbc`.
- Backend canonical task currently reports backend latest upstream `bd646819ed95` / `v7.2.29` as applied to an uncommitted merge candidate with compile verification deferred; do not treat the whole cross-repo task as push-ready until backend is verified and committed.

## Completed Scope

- Added a visible frontend entry for `20260612-sync-upstream-v7-fork-customizations`.
- Marked the old `20260527-sync-upstream` task as predecessor/reference rather than current execution authority.
- Recorded that Usage preservation belongs to the current `v1.16.7` absorption work.
- Recorded the low-quota config naming contract: frontend config UI and transformers use `auto-disable-auth-file-on-low-quota` as the primary key, read legacy `auto-disable-auth-file-on-zero-quota`, and delete the legacy key when saving YAML.
- Recorded the 2026-06-23 frontend fork custom feature inventory against pre-merge baseline `backup/pre-merge-2026-06-16-a02ebbc`.
- Recorded the 2026-06-23 frontend upstream absorption static checklist against latest upstream `ed4124ff3b24` / `v1.17.1`.
- Recorded mechanical baseline extraction evidence for Usage, batch check, auth-file data hook, uiState, ScopedPool badge, VisualConfigEditor, Usage API/types, Ampcode, and release workflows.

## Verification

- `.agents` git visibility check passed: the new reference task is visible, while scratch/workers remain ignored.
- `/home/cheng/.bun/bin/bun run type-check` passed.
- `/home/cheng/.bun/bin/bun run build` passed.
- 2026-06-23 inventory verification used fresh fetch plus targeted `rg` / `git grep <baseline>` comparison; frontend latest upstream containment check passed.
- 2026-06-23 upstream absorption checklist used targeted `rg` / `git grep` over frontend plugin, logs, OAuth excluded, xAI/Grok, websocket and release workflow paths.
- Per user instruction "暂时不做编译验证", the latest inventory update did not rerun `bun run type-check` or `bun run build`.

## Remaining Work

- Continue to use the backend canonical task for live status.
- Wait for backend latest upstream drift handling before declaring the cross-repository sync ready to submit.
- Push, tag, release, and `management.html` upload remain blocked until explicit user authorization.

## Evidence Pointers

- Backend canonical task: `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/`
- Frontend inventory: `evidence/fork-custom-feature-inventory-2026-06-23.md`
- Historical predecessor: `.agents/tasks/20260527-sync-upstream/`
