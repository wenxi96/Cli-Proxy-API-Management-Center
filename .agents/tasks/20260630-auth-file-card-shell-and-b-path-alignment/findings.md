# Findings — 卡片外壳统一 + B 路径 labelKey 映射

## 卡片外壳结构（AuthFileCard.tsx）

- 批量检查外壳：`:389-433` 内联 JSX（`batchCheckInlineCard`），含标题（:392 `batch_check_inline_title`）+ badges（:396 分类+桶位）+ meta（:411 检查时间 + :415 当前可用）+ AuthFileBatchQuotaSection（:420）。
- 单文件刷新区：`:435-441`，无外壳，直接渲染 AuthFileQuotaSection。
- 互斥：`showQuotaLayout`（:138）含 `!batchCheckResult`，两入口互斥。

## 样式类（AuthFilesPage.module.scss）

- `batchCheckInlineCard`(2699) / `batchCheckInlineHeader`(2709) / `batchCheckInlineTitle`(2721) / `batchCheckInlineBadges`(2731) / `batchCheckInlineMeta`(2737) —— 通用结构样式，外壳组件可复用。
- `batchCheckBadge`(2660) + Success/Warning/Danger/Muted/Outline 变体。

## A/B labelKey 映射机制

- codex `WINDOW_META`（quotaConfigs.ts:314-330，buildCodexQuotaWindows 内局部）：id→labelKey，含 five-hour/weekly/monthly/code-review-* 共 6 个。
- claude `CLAUDE_USAGE_WINDOW_KEYS`（constants.ts:86-98，已 export）：key+id+labelKey 三元组，7 个。
- A 路径 labelKey 全部前端硬编码（非后端返回）。

## B 路径后端真实数据（HAR 实证）

- codex `details.windows[].id` = `"five-hour"` / `"weekly"` —— **与 A 路径 WINDOW_META.id 完全一致**，可做前端映射。
- `details` 只有 `plan_type` + `windows`，**无 resetCredits/subscriptionActiveUntil** —— resetCredits 缺口。
- weekly window 数值缺失（只有 id+label）。

## 后端事实

- 纯前端仓库，后端在 `router-for-me/CLIProxyAPI`。
- B 路径 `AuthFileBatchCheckResult.provider` 字段存在但前端未用（batchResultToQuotaView 是 provider 无关的）—— T3 需启用它做 labelKey 分派。
