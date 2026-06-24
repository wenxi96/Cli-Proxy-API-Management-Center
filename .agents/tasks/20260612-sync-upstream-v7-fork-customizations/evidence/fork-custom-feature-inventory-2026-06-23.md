# Fork Custom Feature Inventory - Frontend - 2026-06-23

## Scope

- Repository: `/home/cheng/git-project/Cli-Proxy-API-Management-Center`
- Pre-merge fork baseline: `backup/pre-merge-2026-06-16-a02ebbc = a02ebbcbf695`
- Current branch at inspection: `dev@b60462dc1d33`
- Fresh fetch result on 2026-06-23 CST:
  - `upstream/main = ed4124ff3b24`, tag `v1.17.1`
  - `origin/main = ed4124ff3b24`
  - `origin/main...upstream/main = 0 0`
  - `dev...upstream/main --cherry-pick = 65 0`
  - `git merge-base --is-ancestor upstream/main HEAD` exit `0`
  - current merge-tree conflict count against latest upstream: `0`

Conclusion: current frontend `dev` contains the latest fetched frontend upstream and statically preserves the fork custom frontend features listed below. This inventory is written as a future extraction checklist: each feature includes its user-facing purpose, the pre-merge baseline signal, current code paths, and preservation status.

## Baseline Reference Method

This inventory separates fork custom features from upstream features by comparing three sources:

- Fork baseline: `backup/pre-merge-2026-06-16-a02ebbc`, the local frontend state before this v7 upstream absorption work.
- Current candidate: current `dev@b60462dc1d33`.
- Current upstream: `upstream/main@ed4124ff3b24` / `v1.17.1`.

The baseline checks used targeted `git grep <baseline>` and current `rg`/`git grep` over each feature anchor. A feature is counted as a fork customization only when it existed in the fork baseline and remains in current code, or when it is a fork adaptation required to keep a baseline customization working after upstream changed the surrounding implementation. Upstream-only capabilities are recorded in the static checklist below and are not counted as fork customizations.

### Baseline Extraction Evidence

Mechanical baseline extraction on 2026-06-23 used these checks:

- Baseline governance files present: `.agents`. There was no top-level `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` in `backup/pre-merge-2026-06-16-a02ebbc`, so the fork feature source of truth for this extraction is the baseline source/workflow content plus the current frontend `CLAUDE.md` fork customization summary.
- Baseline feature files present:
  - `src/pages/UsagePage.tsx`
  - `src/components/usage/CostTrendChart.tsx`
  - `src/features/authFiles/hooks/useAuthFilesBatchCheck.ts`
  - `src/features/authFiles/hooks/useAuthFilesData.ts`
  - `src/features/authFiles/uiState.ts`
  - `src/components/providers/ScopedPoolAuthBadge.tsx`
  - `src/components/config/VisualConfigEditor.tsx`
  - `src/services/api/usage.ts`
  - `src/types/usage.ts`
  - `src/services/api/ampcode.ts`
  - `src/types/ampcode.ts`
  - `src/features/providers/sheets/forms/AmpcodeForm.tsx`
  - `.github/workflows/release.yml`
  - `.github/workflows/rebuild-release-history.yml`
- Baseline symbol scan anchors included:
  - `displayName`, `display_name`, `DisplayName`
  - `batch-check`, `batchCheck`
  - `downloadArchive`, `application/zip`
  - `enabledOnly`, `compactMode`
  - `scoped-pool`, `ScopedPool`
  - `auto-disable-auth-file-on-zero-quota`, `auto-disable-auth-file-on-low-quota`
  - `UsagePage`, `chart.js`, `react-chartjs-2`
  - `management.html`
  - `ampcode`, `Ampcode`
- Current quick symbol counts from frontend `rg` over `src`, `package.json`, `.github` and this task directory:
  - `displayName`: 65
  - `display_name`: 25
  - `batch-check`: 8
  - `downloadArchive`: 3
  - `application/zip`: 2
  - `enabledOnly`: 12
  - `compactMode`: 19
  - `scoped-pool`: 44
  - `auto-disable-auth-file-on-low-quota`: 10
  - `auto-disable-auth-file-on-zero-quota`: 11
  - `UsagePage`: 18
  - `chart.js`: 10
  - `react-chartjs-2`: 7
  - `management.html`: 20
  - `ampcode`: only task-governance references, no runtime source references under `src`, `package.json`, or `.github`

The matrix below is the normalized interpretation of that extraction. It intentionally excludes upstream-only additions and treats Ampcode as intentionally removed after user confirmation rather than as a preservation gap.

## Upstream Absorption Static Checklist

These items are upstream capabilities that should be present after absorbing latest upstream. They are listed separately from fork custom features so the audit can prove both directions: upstream additions are included and fork additions are not lost.

| Upstream capability | Baseline signal | Current static evidence | Status |
|---|---|---|---|
| Plugin management pages and plugin store | `backup/pre-merge-2026-06-16-a02ebbc` did not contain `src/features/plugins` or `src/services/api/plugins.ts` | current `src/features/plugins/PluginsPage.tsx`, `PluginStorePage.tsx`, `PluginResourcePage.tsx`, `src/services/api/plugins.ts`, `src/types/plugin.ts`; routes in `src/router/MainRoutes.tsx:10-35`; plugin support event in `src/services/api/client.ts:153` and `src/stores/useAuthStore.ts:288-290` | Absorbed |
| Plugin config in visual editor | absent from fork baseline | `src/types/visualConfig.ts:116-117,190-191`; `src/hooks/useVisualConfig.ts:1136-1391`; plugin i18n keys under locale files | Absorbed |
| Logs fullscreen and request error logs UI | older fork had `LogsPage.tsx`, but not the current upstream error-log/fullscreen flow | `src/pages/LogsPage.tsx:172-181,378-400,683-701,971-991,1146-1178`; `src/services/api/logs.ts:227` fetches error logs | Absorbed |
| OAuth excluded models UI | baseline included the page path but current upstream contract expands the feature | route/page `src/router/MainRoutes.tsx:5,26`; `src/pages/AuthFilesOAuthExcludedEditPage.tsx:27-400`; card integration `src/pages/AuthFilesPage.tsx:50,1899`; config transformer `src/services/api/transformers.ts:468-470`; store config `src/stores/useConfigStore.ts:95,242` | Absorbed |
| xAI/Grok OAuth and quota UI | absent from older fork scope | xAI OAuth provider in `src/pages/OAuthPage.tsx:19-67,146,316-323,476-495`; quota state `src/stores/useQuotaStore.ts:21-69`; Grok icons in `src/pages/SystemPage.tsx:29-42`; xAI locale blocks in all locale files | Absorbed |
| Codex/WebSocket provider/auth controls | absent from older fork scope | provider flags/types `src/types/provider.ts:50`, `src/features/providers/types.ts:27,127`; provider forms/table `src/features/providers/sheets/forms/BaseProviderForm.tsx:706-711`, `src/features/providers/components/ProviderResourceTable.tsx:120-121`; auth-file editor `src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx:147-154`; transformer/API payload `src/services/api/transformers.ts:155-156`, `src/services/api/providers.ts:41,316` | Absorbed |
| Bun/Node 24 release and rebuild workflow | baseline release history rebuild used older npm-centered flow | `package.json:6` declares `bun@1.3.14`; `.github/workflows/release.yml:39-44,74-84,93`; `.github/workflows/rebuild-release-history.yml:41-46,125-149` supports Bun, legacy npm fallback and `management.html` | Absorbed and adapted |

Static absorption conclusion: current frontend `dev` contains latest fetched upstream `ed4124ff3b24` and the upstream code paths above are present. This is static evidence only; per user instruction, this update did not rerun `bun run type-check` or `bun run build`.

## Feature Preservation Matrix

| Fork custom feature | Baseline evidence | Current evidence | Status |
|---|---|---|---|
| DisplayName in provider/auth flows | baseline `src/services/api/transformers.ts` normalized `displayName/display_name`; `src/types/provider.ts` had `displayName`; auth-file model modal rendered `model.display_name` | current `src/services/api/transformers.ts:148-151,220-223` normalizes display names; `src/types/provider.ts:33,48`; `src/features/authFiles/components/AuthFileModelsModal.tsx:75`; `src/types/sourceInfo.ts:2` | Preserved |
| Auth Files batch check UI/API | baseline `AuthFilesPage.tsx` imported `AuthFilesBatchCheckModal` and `useAuthFilesBatchCheck`; API used `/auth-files/batch-check` and `/auth-files/batch-check-jobs`; types under `src/types/authFile.ts` | current `AuthFilesPage.tsx:45-55,274-283,340-348,895-928,1078-1128,1418-1420`; `src/services/api/authFiles.ts:378-413`; `src/types/authFile.ts:58-258`; modal and tiered reenable components remain under `src/features/authFiles/components/` | Preserved |
| Auth Files custom filters and compact mode | baseline `AuthFilesPage.tsx:258-261` had `problemOnly`, `enabledOnly`, `disabledOnly`, `compactMode`; persistence and filtering at `398-466`, `578-583` | current `AuthFilesPage.tsx:259-262`, persisted state at `396-463`, filter predicates at `579-584`, page-size switch at `383`, compact mode storage via `uiState.ts:21,74-77` | Preserved |
| Auth Files ZIP download | baseline multi-select ZIP support existed in auth-file data hooks/components | current auth-file API/data layer still exposes download paths; `src/features/authFiles/hooks/useAuthFilesData.ts` remains present; backend contract is `auth_files.go:829`; frontend page keeps selected-file state (`AuthFilesPage.tsx:895-907`) | Preserved |
| Auth Files scoped-pool status summary | baseline `AuthFilesPage.tsx:605-837` computed `AuthFileScopedPoolSummary`; `AuthFileCard` rendered scoped-pool badges | current `AuthFilesPage.tsx:606-838`, metrics at `749-792`, visibility at `802-806`; `AuthFileCard.tsx:220-251,342-364`; `src/utils/scopedPool` is consumed from the page/card | Preserved |
| Scoped Pool visual config editor | baseline `VisualConfigEditor.tsx` and `useVisualConfig.ts` handled routing scoped-pool defaults/providers | current types in `src/types/config.ts:16-43` and `src/types/visualConfig.ts:8-33,91,141-148`; editor UI/handlers in `VisualConfigEditor.tsx:478-598,1450-1720`; parser/serializer in `useVisualConfig.ts:545-616,1243-1265,1572-1642`; API calls in `src/services/api/config.ts:138-145` | Preserved |
| Low-quota auto-disable primary naming with legacy compatibility | baseline frontend used `quotaAutoDisableAuthFileOnZeroQuota` and `auto-disable-auth-file-on-zero-quota` | current primary field is `quotaAutoDisableAuthFileOnLowQuota`: `src/types/config.ts:11`, `src/types/visualConfig.ts:137,211`, API `src/services/api/config.ts:59-78`; transformer reads both low/legacy zero fields at `src/services/api/transformers.ts:390-397`; `useVisualConfig.ts:1229-1235` also reads legacy names | Preserved with intentional renamed primary key |
| Usage statistics page and charts | baseline included Usage page, chart deps, store/API/types and nav | current `package.json:20,24`; route `src/router/MainRoutes.tsx:9,30`; nav `src/components/layout/MainLayout.tsx:562-565`; API `src/services/api/usage.ts:25-49`; store `src/stores/useUsageStatsStore.ts:40-135`; page `src/pages/UsagePage.tsx:122-409`; chart components import `chart.js` / `react-chartjs-2` | Preserved |
| Usage auth-file integration | baseline Auth Files page loaded usage/key stats for credential cards | current `src/features/authFiles/hooks/useAuthFilesStats.ts:13-23`; `AuthFilesPage.tsx:60,374`; source display mapping via `src/types/sourceInfo.ts` and `src/utils/sourceResolver.ts` | Preserved |
| Fork tag-only release and management.html asset | baseline `release.yml` tag guard and `management.html` upload; rebuild workflow used npm for old history | current `release.yml:11,84-93` still guards release on `refs/tags/v` and uploads `dist/management.html`; rebuild workflow handles Bun when `bun.lock` exists and still emits `management.html` at `rebuild-release-history.yml:125-149` | Preserved and adapted to Bun |
| AMP/Ampcode removal | baseline Ampcode files existed before user decision | current source search for `ampcode` / `Ampcode` under `src`, `package.json`, `.github` returned no matches | Removed intentionally, not a missing fork feature |

## Detailed Frontend Feature Notes

### DisplayName In Provider/Auth Flows

- Purpose: allow credentials and models to show human-friendly names in provider resources, auth-file modals, quota/usage displays and mapping diagrams instead of raw IDs only.
- Baseline logic: provider transformers accepted `displayName`, `display_name` and `display-name`; auth-file model modal rendered `model.display_name`; provider resource types carried `displayName`.
- Current logic: `src/services/api/transformers.ts:148-151,220-223` normalizes display-name aliases, `src/services/api/providers.ts:30-31,314,380` keeps display-name payload handling, `src/types/provider.ts:33,48` keeps type fields, and `src/features/authFiles/components/AuthFileModelsModal.tsx:75` renders model display names.
- Runtime path: backend model/auth metadata enters API transformers, lands in provider/auth-file resource types and is displayed in provider tables, detail views, auth-file modals and usage attribution.
- Status: preserved.

### Auth Files Batch Check UI/API

- Purpose: run quota/health checks over selected, current-page or all auth files; show progress, risk/capacity summaries, detailed diagnosis and direct recovery actions.
- Baseline logic: `AuthFilesPage.tsx` used `AuthFilesBatchCheckModal`, `useAuthFilesBatchCheck`, batch-check store state and API calls to `/auth-files/batch-check` / `/auth-files/batch-check-jobs`.
- Current logic: page state and UI are present in `src/pages/AuthFilesPage.tsx:274-283,340-348,895-928,1078-1128,1418-1668,1938-2100`; API methods are in `src/services/api/authFiles.ts:378-413`; response/job types are in `src/types/authFile.ts:58-258`; result persistence is exposed through `src/stores/useBatchCheckStore.ts`.
- Runtime path: the page computes target names by scope, creates a batch-check job, polls progress, stores latest results across page changes, maps results back to cards and opens modal/detail/re-enable workflows.
- Status: preserved.

### Auth Files Custom Filters, Search, Sort And Compact Mode

- Purpose: preserve fork-authored page ergonomics for credential-heavy deployments: provider filter rail, search text, problem-only filter, enabled-only filter, disabled-only filter, compact mode, separate regular/compact page sizes and sort mode.
- Baseline logic: `AuthFilesPage.tsx` had `problemOnly`, `enabledOnly`, `disabledOnly`, `compactMode`; persisted state and filter predicates lived in page/local storage helpers.
- Current logic: state is defined in `src/pages/AuthFilesPage.tsx:258-263`; hydration/persistence is at `src/pages/AuthFilesPage.tsx:385-461`; status filters are applied at `src/pages/AuthFilesPage.tsx:576-584`; local-storage schema is in `src/features/authFiles/uiState.ts:5-21,49-77`.
- Runtime path: the page first filters by problem/enabled/disabled state, then builds provider counts and page results; compact mode changes page size and rendering density; state is persisted to `authFilesPage.uiState` and `authFilesPage.compactMode`.
- Status: preserved. This explicitly includes the fork-only `enabledOnly` filter that is easy to lose when rebasing onto upstream's auth-file page.

### Auth Files ZIP Download

- Purpose: download multiple selected auth files as a zip archive from the management backend.
- Baseline logic: multi-select action invoked a backend archive endpoint; single-file selections still used the normal download path.
- Current logic: `src/features/authFiles/hooks/useAuthFilesData.ts:627-655` deduplicates names, falls back to single download for one file, calls `authFilesApi.downloadArchive`, wraps non-Blob data as `application/zip`, resolves the response filename and downloads it; `src/pages/AuthFilesPage.tsx:895-907` preserves selected-name target state.
- Runtime path: selected names are sent to backend `/auth-files/download-archive`; browser receives `auth-files-N.zip` or the server-provided filename.
- Status: preserved.

### Auth Files Scoped-Pool Status Summary

- Purpose: show how selected auth files participate in provider-local scoped-pool routing, so users can see in-pool, standby, penalized and disabled pool states directly from the auth-file page.
- Baseline logic: the page computed an `AuthFileScopedPoolSummary` and cards rendered scoped-pool badges.
- Current logic: summary computation remains in `src/pages/AuthFilesPage.tsx:606-838`; card badges are in `src/features/authFiles/components/AuthFileCard.tsx:220-251,342-364`; reusable badge component lives in `src/components/providers/ScopedPoolAuthBadge.tsx`.
- Runtime path: frontend reads scoped-pool status from config/management state, groups auth files by provider and state, and displays summary rows plus per-card scoped-pool badges.
- Status: preserved.

### Scoped Pool Visual Config Editor

- Purpose: provide a UI for `routing.scoped-pool` global enablement, defaults and per-provider overrides without requiring users to edit YAML manually.
- Baseline logic: `VisualConfigEditor.tsx` and `useVisualConfig.ts` parsed and serialized routing scoped-pool defaults and provider entries.
- Current logic: types live in `src/types/config.ts:16-43` and `src/types/visualConfig.ts:8-33,91,141-148`; editor validation/options/UI are in `src/components/config/VisualConfigEditor.tsx:382-465,1450-1720`; parser/serializer logic is in `src/hooks/useVisualConfig.ts:1133,1243-1265,1580-1649`; API read/write uses `src/services/api/config.ts:138-145`.
- Runtime path: VisualConfigEditor reads backend config, normalizes scoped-pool entries, validates limits/thresholds/windows, serializes YAML under `routing.scoped-pool` and persists through management config endpoints.
- Status: preserved.

### Low-Quota Auto-Disable Naming And Legacy Compatibility

- Purpose: keep the renamed low-quota semantics while allowing old zero-quota configs to load and migrate cleanly.
- Baseline logic: frontend used `quotaAutoDisableAuthFileOnZeroQuota` and YAML key `auto-disable-auth-file-on-zero-quota`.
- Current logic: primary field is `quotaAutoDisableAuthFileOnLowQuota` in `src/types/config.ts:11`, `src/types/visualConfig.ts:137,211`; API writes `/quota-exceeded/auto-disable-auth-file-on-low-quota` in `src/services/api/config.ts:59-78`; transformers read low and legacy zero names in `src/services/api/transformers.ts:390-397`; YAML parsing/writing reads legacy fields and deletes the old key on save in `src/hooks/useVisualConfig.ts:1229-1235,1543-1547`.
- Runtime path: old YAML remains readable, new UI/API uses low-quota naming, and saving through the visual editor removes `auto-disable-auth-file-on-zero-quota`.
- Status: preserved with intentional primary-name change.

### Usage Statistics Page, Charts, Import/Export And Auth-File Integration

- Purpose: expose backend usage persistence data as an operator page with request/token/cost totals, time ranges, chart-line selection, model/API stats, import/export and auth-file attribution.
- Baseline logic: fork had Usage route/nav/page, chart dependencies, usage API/store/types and auth-file usage stats.
- Current logic: dependencies remain in `package.json:20,24`; route is `src/router/MainRoutes.tsx:9,30`; navigation entry is `src/components/layout/MainLayout.tsx:562-565`; API calls are `src/services/api/usage.ts:25-49`; store/in-flight caching is `src/stores/useUsageStatsStore.ts:40-135`; main page is `src/pages/UsagePage.tsx:122-409`; chart components use `chart.js` / `react-chartjs-2`; auth-file integration uses `src/features/authFiles/hooks/useAuthFilesStats.ts:13-23`, `src/types/sourceInfo.ts` and `src/utils/sourceResolver.ts`.
- Runtime path: page loads `/usage`, filters by `7h` / `24h` / `7d` / `all`, persists selected chart lines and time range in localStorage, displays chart cards and detail tables, and calls `/usage/export` / `/usage/import` for snapshots.
- Status: preserved.

### Fork Tag-Only Release And `management.html`

- Purpose: ensure production panel releases only happen from version tags and the release artifact is named `management.html` for backend updater compatibility.
- Baseline logic: release workflow gated on tag refs and renamed Vite `index.html` to `management.html`.
- Current logic: `.github/workflows/release.yml:11` still gates the job to `refs/tags/v`; `.github/workflows/release.yml:84-93` still moves and uploads `dist/management.html`; `.github/workflows/rebuild-release-history.yml:125-149` supports Bun or npm history rebuilds and checks `management.html`.
- Runtime path: new tag release builds panel, renames `index.html`, uploads `management.html`; backend management updater then downloads the latest fork release asset.
- Status: preserved and adapted to Bun.

### AMP/Ampcode Removal

- Purpose: follow the user's explicit decision to accept upstream removal of Ampcode and avoid dead frontend routes/API calls.
- Baseline logic: fork had Ampcode types, service API, provider form, i18n and README references before user decision.
- Current logic: searches for `ampcode` / `Ampcode` under `src`, `package.json` and `.github` return no matches; old Ampcode API/type/form files are deleted.
- Runtime path: Ampcode is no longer displayed or callable from the frontend.
- Status: removed intentionally, not a fork preservation gap.

## Verification Notes

Commands read during this inventory:

- `git fetch upstream --tags --prune && git fetch origin --tags --prune`
- `git rev-parse --short=12 upstream/main origin/main dev HEAD`
- `git rev-list --left-right --count origin/main...upstream/main`
- `git rev-list --left-right --count --cherry-pick dev...upstream/main`
- `git merge-base --is-ancestor upstream/main HEAD`
- `git merge-tree --name-only --no-messages dev upstream/main | sed '1d' | sort -u | wc -l`
- `git diff --name-only --diff-filter=U`
- conflict-marker search under `src`, `package.json`, `bun.lock` and `.github`
- targeted `rg` and `git grep` over baseline/current feature symbols listed above

This inventory is static code evidence. It should be paired with the normal frontend verification (`bun install --frozen-lockfile`, `bun run type-check`, `bun run build`) before push/release. Per current user instruction on 2026-06-23, compile/build verification is deferred for now.
