# Findings

## 远端状态（2026-05-29 已复核）

| 分支 | Commit | 状态 |
|---|---|---|
| `upstream/main` | `87702bb` | 最新 |
| `origin/main` | `87702bb` | 已同步 |
| `local main` | `87702bb` | 已同步 |
| `local master` | `fac0e6f` | 待合并 |
| `local dev` | `fac0e6f` | 与 master 一致，可作为当前执行入口 |

合并基点：`808f44d`（last sync 2026-05-15 的合并参照）。

## Commit 范围复核（2026-05-29）

- 实测 `dev..upstream/main` 共 70 个 commit。
- 原计划写的“47 个新 commit”不再作为执行依据。
- 先前跳过清单中的 15 个 commit 仍出现在 `dev..upstream/main` 中；若直接 `git merge upstream/main` 会被一并吸收，违反非目标。
- 本次继续忽略这 15 个先前跳过项。
- 本次新功能/修复按逐项复核结果吸收；merge 元数据提交不单独吸收。
- 详细逐项复核见 `evidence/commit-scope-review-2026-05-29.md`。
- 执行策略调整为选择性 replay/cherry-pick 或等价手动补丁方式，不再以普通 `git merge upstream/main` 作为主路径。

## Fork 自定义涉及的关键文件

| 功能 | 关键文件 |
|---|---|
| DisplayName | `pages/AiProviders{Claude,Codex,Gemini,Vertex}EditPage.tsx`、`pages/AiProvidersClaudeEditLayout.tsx`、`services/api/providers.ts`、`components/providers/{Claude,Codex,Gemini,Vertex}Section/*Section.tsx`、`i18n/locales/{en,zh-CN,zh-TW,ru}.json` |
| Auth Files Batch Check | `features/authFiles/components/{AuthFilesBatchCheckModal,ReenableTieredModal}.tsx`、`stores/useBatchCheckStore.ts`、`pages/AuthFilesPage.{tsx,module.scss}`、`features/authFiles/hooks/useAuthFilesBatchCheck.ts` |
| 范围轮询 | `components/config/VisualConfigEditor.tsx`、`components/providers/{ScopedPoolAuthBadge,utils}.tsx`、`hooks/useVisualConfig.ts`、`types/visualConfig.ts`、`features/authFiles/components/AuthFileCard.tsx` |
| 多选压缩下载 | `features/authFiles/hooks/useAuthFilesData.ts`、`services/api/authFiles.ts` |
| CI/release | `.github/workflows/*` |

## 上游冲突点（已分析）

| # | 冲突 | 上游 commit | Fork 文件 | 决策 |
|---|---|---|---|---|
| 1 | DisplayName vs Provider 架构重构 | `34a050d`（删除旧 provider 编辑页） | `AiProviders*EditPage.tsx` `*Section.tsx` | 方案 A：在新架构 `features/providers/sheets/` 重建 displayName |
| 2 | Auth Files Page 修复 | `33df506` `8d3a482` `bb0c0a7` `300f73e` | `AuthFilesPage.tsx`（fork +610 行） | 以 fork 为主，手动合入 |
| 3 | Filter Controls 搜索 | `77e7dd0` | `AuthFilesPage.tsx` 筛选区 | 以 fork 布局为主，叠加搜索 |
| 4 | VisualConfigEditor 样式 | `cd1e7ff` `4ef5869` | `VisualConfigEditor.tsx`（fork +1004 行） | 以 fork 结构为主，吸收样式/i18n |
| 5 | Home Control Plane UI | `d6f5c45` 添加 → `f0d669f` 删除 | n/a | 接受上游最终（移除 Home UI） |

## 上游新架构调研

确认上游 `34a050d` 引入的新 provider 架构：
- `features/providers/types.ts` — provider/credential type 定义（**未含** displayName 字段）
- `features/providers/sheets/forms/BaseProviderForm.tsx` — 基础表单（**未含** displayName）
- `features/providers/sheets/{ProviderSheet,ResourceDetailView}.tsx` — Sheet 与详情视图
- `features/providers/useProviderWorkbench.ts` — workbench state 管理
- `features/providers/sheets/forms/AmpcodeForm.tsx` — Ampcode 专用表单

需要在新架构中重建 DisplayName 字段。

## 跳过项（沿用先前忽略，2026-05-15 之前 15 commits）

```
a4d1c23 cc8632b 8ed837c b25f722 7d3c570 632be0b 011cd3b
6a10082 15e32ee 789f003 1a056ec 4cfc8b9 9f7c471 126f7fa 62092cc
```

这些 commit 本次复核结论均为 `continue_skip`，不得通过普通 merge 间接吸收。
