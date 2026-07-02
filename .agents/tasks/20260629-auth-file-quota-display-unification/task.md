# 认证文件额度展示统一化

## 任务摘要

统一认证文件在「单文件刷新额度」与「批量检查概览卡片」两处入口的额度展示：抽取批量侧（B）的行渲染为可复用视图组件 `QuotaRowsView`，为单文件侧（A）的 5 个 provider 各写一个 adapter，把各自 state 转成与 B 相同的 `NormalizedQuotaView` 结构；A 通用部分改用统一视图，provider 特有信息作为 extras 保留。仅渲染层统一，不动数据获取层/store/后端契约。

## 范围

- 做：渲染层统一（A 对齐 B）；新建 `QuotaRowsView` + `quotaView.tsx`；5 个 provider adapter。
- 不做：不改 `fetchQuota`/`resetQuota`/store/后端接口/`QuotaProgressBar` 阈值/`AuthFileCard` 互斥显示逻辑；不重写 QuotaPage 路径；不删除 `quotaConfigs.ts` 的 `renderQuotaItems`（QuotaPage 仍依赖）。

## 验收条件

- `bun run type-check` / `bun run lint` / `bun run build` 全 exit 0。
- 同一认证文件在单文件刷新与批量检查两入口：百分比精度、amount、reset、行标签、进度条一致；provider 特有信息仅在对应卡片展示。

## 状态指针

- Canonical Plan Path: `plans/2026-06-29-auth-file-quota-display-unification-implementation-plan.md`
- Live Status Authority: `progress.md`
- Execution Mode: direct_inline
- Status: completed. T1-T4 实现完成，tsc + eslint 实证通过（build 缺口为环境 native binding 问题，非代码）。T5 经用户浏览器反馈部分验证：额度行渲染层（套餐类型、QuotaRowsView 统一视图、百分比小数、leaf/group 分型）已在两入口生效一致。用户反馈的剩余不一致属「卡片外壳元信息 + B 路径数据展示逻辑」，超出本任务范围，另起新任务 `20260630-auth-file-card-shell-and-b-path-alignment`。
