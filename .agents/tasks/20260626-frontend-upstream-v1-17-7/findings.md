# Findings

## Branch Baseline

- Repository: `Cli-Proxy-API-Management-Center`
- Work branch: `dev@e11a5281f4f3`
- Remote development branch: `origin/dev@e11a5281f4f3`
- Upstream mirror: `main == origin/main == upstream/main == acf432b26e48`
- Target tag: `v1.17.7`
- Divergence: `origin/dev...origin/main = 66 27`
- Merge rehearsal conflicts:
  - `src/components/ui/Select.tsx`
  - `src/features/providers/components/ProviderResourceTable.tsx`
  - `src/features/providers/sheets/ResourceDetailView.tsx`
  - `src/i18n/locales/ru.json`
  - `src/pages/AuthFilesPage.tsx`
  - `src/services/api/config.ts`
  - `src/services/api/transformers.ts`

## Commit Absorption Matrix

| Commit | 功能作用 | 建议 | 冲突 | 解决建议 |
|---|---|---|---|---|
| `b566884` | 展示 Codex reset credit expiries。 | 吸收 | `ru.json` | 合并 reset quota 和 expiry 两组 key。 |
| `5d5ba48` | reset credits PR merge。 | 随父提交吸收 | 无 | 无单独处理。 |
| `6857856` | 修复 layout align items 起始对齐。 | 吸收 | 无 | 保持上游样式修复。 |
| `4ebcf51` | 增加 APIKEY.FUN provider 管理和 UI。 | 吸收 | Provider 组件、`ru.json` | 保留 DisplayName，叠加 APIKEY.FUN 资源分支。 |
| `7bb43db` | APIKEY.FUN 链接增加外链图标和样式。 | 吸收 | 无 | 保持上游 UI。 |
| `6861c99` | 空 action button 样式模块化。 | 吸收 | 无 | 保持上游重构。 |
| `87a2447` | APIKEY.FUN base URL 处理和 URL 选择 UI。 | 吸收 | Resource detail、`ru.json` | 保留 fork detail title，叠加 sponsor protocol 展示。 |
| `d2b7049` | sponsor key management UI。 | 吸收 | `ru.json` | 合并新增翻译 key。 |
| `1ab3f0d` | APIKEY.FUN usage check。 | 吸收 | `ru.json` | 合并新增翻译 key。 |
| `e7e70cc` | provider logo 暗/亮主题、sponsor links、本地化。 | 吸收 | `ru.json` | 合并新增翻译 key。 |
| `e3ca3aa` | plugin OAuth UI、本地化增强。 | 吸收 | `ru.json` | 与后端 plugin OAuth 能力对齐。 |
| `3db688b` | APIKEY.FUN quick start panel 和路由。 | 吸收 | `ru.json` | 保留 dashboard / route 改动。 |
| `88d4d2b` | quick start variant 支持和样式增强。 | 吸收 | 无 | 保持上游改动。 |
| `fdd2f99` | SponsorQuickStartPanel 和 shared forms 响应式/可访问性。 | 吸收 | 无 | 保持上游改动。 |
| `e33b756` | dashboard quick start card 与多语言。 | 吸收 | `ru.json` | 合并新增翻译 key。 |
| `1d1955f` | SponsorQuickStartPanel empty state 和 action button。 | 吸收 | 无 | 保持上游改动。 |
| `76cc3d9` | ProvidersWorkbenchPage 与 APIKEY.FUN 配置交互增强。 | 吸收 | 无 | 与 DisplayName 保留一起验证。 |
| `d654ec1` | quick start 术语更新。 | 吸收 | `ru.json` | 合并新增翻译 key。 |
| `3fc6a49` | register link 文案更新。 | 吸收 | `ru.json` | 合并新增翻译 key。 |
| `0d76721` | Codex reset credits error styling。 | 吸收 | 无 | 保持上游样式。 |
| `e56edde` | ProviderResourceTable 和 providerStatusBar UI 响应式增强。 | 吸收 | ProviderResourceTable | 保留 fork `displayName` 优先显示，同时吸收 openaiCompatibility/APIKEY.FUN 分支。 |
| `e144cf3` | reset credits expiry 标签改为 GMT+8。 | 吸收 | `ru.json` | 合并 expiry label。 |
| `d7847da` | plugin normalization 支持 legacy OAuth providers。 | 吸收 | 无 | 与 plugin OAuth UI 验证。 |
| `c37b026` | 通用可读性和一致性重构。 | 吸收 | 7 个冲突文件 | 逐文件保留 fork 定制并吸收上游结构。 |
| `2ec1a71` | AuthFiles status filter mode 和本地化。 | 吸收 | `AuthFilesPage.tsx`, `ru.json` | 采用 `statusFilterMode`，兼容旧 boolean fields。 |
| `213671b` | AuthFilesStatusFilterCard 组件重构和样式。 | 吸收 | `AuthFilesPage.tsx`, `ru.json` | 使用新卡片 UI，保留批量检查和 scoped poll。 |
| `acf432b` | trackWrapper thumb positioning 样式更新。 | 吸收 | 无 | 保持上游样式。 |

## Conflict Strategy

- `src/features/authFiles/uiState.ts`: 这是 AuthFiles 状态契约文件，不是 merge-tree 文本冲突文件，但双方都修改过，必须随 `AuthFilesPage.tsx` 一起合并；保留上游 `AUTH_FILES_STATUS_FILTER_MODES`、`AuthFilesStatusFilterMode`、`statusFilterMode`、`isAuthFilesStatusFilterMode`，同时保留 fork `enabledOnly` 和 `batchCheckConcurrency`。旧状态迁移优先级固定为 `problemOnly -> disabledOnly -> enabledOnly -> all`，新状态优先使用合法 `statusFilterMode`。
- `src/pages/AuthFilesPage.tsx`: 采用上游 `statusFilterMode` 和 `AuthFilesStatusFilterCard`；保留 fork 批量检查、结果持久化、enabled/disabled 筛选、scoped poll、stats refresh；读取旧 `problemOnly` / `disabledOnly` / `enabledOnly` 字段兼容，并与 `uiState.ts` 的迁移优先级一致。
- `src/features/providers/components/ProviderResourceTable.tsx`: 保留 fork `displayName || apiKeyPreview` 作为标题，同时吸收上游 `openaiCompatibility` / APIKEY.FUN 资源展示。
- `src/features/providers/sheets/ResourceDetailView.tsx`: 对 APIKEY.FUN 使用上游 sponsor detail 分支；普通资源继续显示 `displayName || name || identifier`。
- `src/components/ui/Select.tsx`: 保留 fork disabled option 的键盘、鼠标、aria 和 disabled 保护，吸收上游格式化。
- `src/services/api/config.ts`: 保留 fork `getRoutingScopedPool` / `updateRoutingScopedPool`，吸收上游格式化。
- `src/services/api/transformers.ts`: 保留 scoped-pool、low-quota 自动禁用字段，吸收 `antigravityCredits`。
- `src/i18n/locales/ru.json`: 合并双方 key，不删除已有 fork reset quota key。

## Semantic Risk Files

这些文件当前不一定产生 text conflict，但承载 fork 定制或双方语义改动，L03/L04 不能只按 conflict marker 判断安全：

- `src/features/authFiles/uiState.ts`: AuthFiles 持久化状态契约，必须合并 `statusFilterMode` 与 fork `enabledOnly` / `batchCheckConcurrency`。
- `src/features/authFiles/hooks/useAuthFilesData.ts`: ZIP 下载和批量检查数据流入口，必须保留 `downloadArchive` 多文件路径。
- `src/services/api/authFiles.ts`: ZIP 下载 API `/auth-files/download-archive` 入口，必须保留。
- `.github/workflows/release.yml`: fork release policy 权威文件；当前 workflow 必须保持 tag guard，不能恢复为 push master 自动发布。
- `scripts/version.sh`, `scripts/release-lib.sh`, `release-metadata.env`: fork version suffix / release metadata 链路，`main` 相对 merge-base 没有删除这些文件，但它们是 fork-only 保留项。
- `.github/workflows/sync-upstream.yml`: fork upstream sync workflow，`main` 相对 merge-base 没有删除该文件；L04 只做存在性和触发条件核对，不触发 workflow。

## Fork Customization Checklist

- DisplayName: 必须保留 provider 表格、详情、卡片标题优先级。
- Auth Files Batch Check: 必须保留 tiered restart modal、跨页结果持久化、mobile 可达性。
- Scoped Poll: 必须保留 VisualConfigEditor 总开关和 AuthFileCard 状态展示。
- ZIP Download: 必须保留认证文件多选压缩下载。
- CI/Release: 必须保持 tag-only 正式发布和 fork 版本后缀。

## Verification Notes

- Required commands:
  - `bun install --frozen-lockfile` if `package.json` / `bun.lock` changed during merge or dependency install state is stale/unknown.
  - `bun run type-check`
  - `bun run lint`
  - `bun run build`
- Manual checks after code merge:
  - DisplayName: provider list/detail/card title must prefer user `displayName`; API key preview remains visible as secondary text where applicable.
  - AuthFiles persisted state: seed old localStorage states for `problemOnly`, `disabledOnly`, and `enabledOnly`; verify migration priority `problemOnly -> disabledOnly -> enabledOnly -> all` and that new `statusFilterMode` is written back.
  - Auth Files Batch Check: with a local non-sensitive backend/test data, select visible files, run batch check, observe progress/result persistence and stats refresh. Sub-assertions must include tiered re-enable modal visibility/action availability, page-change or cross-page result persistence, and mobile viewport reachability for batch controls; without data that can exercise a sub-assertion, mark that subcheck `blocked` or `partial`, not verified.
  - Scoped Poll: verify VisualConfigEditor/global scoped poll control and AuthFileCard scoped-pool state remain visible/reachable; without runtime scoped-pool data, mark behavior check `partial`.
  - ZIP Download: select two or more auth files, trigger batch download, confirm request path remains `/auth-files/download-archive`, filename defaults to `auth-files-<count>.zip` unless response header overrides, and browser download succeeds; if browser download cannot be observed, record the limitation.
  - Release policy: statically inspect `.github/workflows/release.yml` for tag-only trigger and `startsWith(github.ref, 'refs/tags/v')`; inspect `scripts/version.sh` / `scripts/release-lib.sh` / `release-metadata.env` for fork suffix handling; record stale/conflicting prose in `docs/fork-maintainer-workflow.md` as follow-up if still present.
  - Dev/preview server: use `bun run dev` for interactive manual checks, or `bun run preview` after `bun run build`; do not claim UI behavior verified if no server/browser observation was possible.
