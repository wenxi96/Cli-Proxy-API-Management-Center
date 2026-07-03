# Handoff — 认证文件额度展示统一化

## Current State

**已完成（completed）**。额度行渲染层统一目标达成：A/B 两入口均走 `QuotaRowsView` + 归一化视图模型，套餐类型、百分比小数算法、leaf/group 分型在两入口一致。

tsc + eslint 实证通过；build 缺口为环境 native binding 问题（非代码）。用户浏览器反馈确认渲染层已生效一致；剩余不一致属「卡片外壳元信息 + B 路径数据展示逻辑」，不在本任务范围，另起新任务处理。

canonical plan：`plans/2026-06-29-auth-file-quota-display-unification-implementation-plan.md`。
完整时间线：`progress.md`。

## Completed Scope

- **T1**：新建 `src/features/authFiles/utils/quotaView.tsx`——归一化模型（leaf/group discriminated union + NormalizedQuotaView + NormalizedQuotaResetCredits）+ B 路径迁移 + `batchResultToQuotaView`。
- **T2**：新建 `src/features/authFiles/components/QuotaRowsView.tsx`——按 row.kind 分派渲染；`AuthFileBatchQuotaSection` 从 252 行精简到 21 行。
- **T3**：5 个 provider adapter + `providerStateToQuotaView`。drift：用户决策给 quotaConfigs.ts 的 10 个私有辅助函数加 export（逻辑零改动）。
- **T4**：`AuthFileQuotaSection` success 分支接入统一视图，保留 QuotaPage 的 renderQuotaItems 不删。
- **T5（部分验证）**：用户浏览器反馈确认渲染层一致；修复 2 个真实 bug（codex 过期日 formatDateTimeValue High + kimi 百分比 Math.round Medium）。

## Verification

- ✅ `tsc --noEmit` 通过（外部评审报告实证）
- ✅ `eslint --ext ts,tsx` 通过（外部评审报告实证）
- ⚠️ `vite build` 未完成——WSL+Windows Node 缺 `@rolldown/binding-win32-x64-msvc` native binding（环境问题，非代码）
- ✅ 用户浏览器 T5 反馈：额度行渲染层（套餐类型/统一视图/百分比）两入口一致
- 未做完整 5-provider 人工双入口对比（用户反馈聚焦 codex，其余 provider 视觉未验证；但渲染层逻辑等价，风险低）

## Remaining Work（不在本任务范围，转新任务）

用户反馈的新需求，另起任务 `20260630-auth-file-card-shell-and-b-path-alignment`：

1. **单文件刷新加卡片外壳**：标题"额度概览" + 右侧标签（可用/额度情况）+ 刷新时间 + 移除"当前可用"字段（已有可用标签）。
2. **批量检查额度内容对齐单文件刷新**：B 路径展示 A 的多窗口逻辑（五小时/周/月额度等）。需处理 A/B 数据源差异（B 来自后端 `AuthFileBatchCheckWindow`，A 来自 provider 精细 API）。

## 接手要点

- 代码基线 `dev@d8b3dd4`，在 dev 上推进。
- 不动数据获取层/store/后端契约/QuotaProgressBar 阈值/AuthFileCard 互斥逻辑（本任务守住）。
- QuotaPage 路径（components/quota/QuotaCard.tsx）不纳入统一，renderQuotaItems 保留不删。
- A 路径百分比统一小数（formatPercentValue）；antigravity percentLabel 保留 provider 特有文案。
- 新任务注意：本任务已建立的 `QuotaRowsView` + `quotaView.tsx` 是新任务的渲染基座，卡片外壳改造在 `AuthFileCard.tsx` 层，不要破坏已统一的额度行渲染。
