# Findings

## 已确认事实

- A 路单文件刷新已经在 `buildCodexQuotaWindows` 中按 `limit_window_seconds` 判断 Codex 窗口类型，并把月度窗口映射到 `CODEX_WINDOW_META.codeMonthly` / `codeReviewMonthly`。
- B 路 `batchResultToQuotaView` 原先仍走通用 batch rows 逻辑，只做 label 映射，Codex provider 没有复用 A 路 `CodexQuotaState` 到 `NormalizedQuotaView` 的完整适配。
- 后端历史返回中可能存在 `id=five-hour` 但 `limit_window_seconds` 是 30 天的窗口；前端若只相信 id，会把月度额度展示成 5 小时。
- 空 weekly 行来自没有有效展示数值的 batch window；这种行不应出现在 Codex 批量卡片中。

## 根因

B 路 Codex 展示逻辑与 A 路 Codex 展示逻辑仍存在两套适配路径：A 路按 provider state 精细处理，B 路按通用 batch window 直接渲染，导致月度窗口、reset credits、订阅到期和空窗口过滤无法自然对齐。

## 已排除

- 不是 QuotaRowsView 渲染组件问题：同一个视图模型输入下，A/B 都走该组件。
- 不是单纯 i18n 问题：错误发生在进入翻译前的 window 元信息和 state 适配阶段。
