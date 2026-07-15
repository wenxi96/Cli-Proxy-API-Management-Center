# 前端代码评审 Round 9

## 评审结论

- Reviewer: OpenCode `plan` agent / `deepseek-v4-flash-free`
- Verdict: `ready_with_updates`
- Scope: Round 8 修复后的完整前端候选。

## Findings

- `F-R9-001` (`low`): `cost_need_price` 在移除旧 `hasPrices` 分支后只存在于四语言 locale，成为无消费者的死键。
- `F-R9-002` (`low`): 当所有明细都因缺价格不可计算时，`CostTrendChart` 显示“暂无成本数据”，不如“请先设置模型价格”可操作。

## Disposition

- `CostSeries` 新增聚合 `costStatus`，hourly/daily series 从同一批 `NormalizedUsageCost` 派生状态。
- `CostTrendChart` 仅在 `costStatus === unconfigured` 时显示 `cost_need_price`；`unknown_usage` 继续显示 `cost_no_data`，避免把缺 usage 误报成缺价格。
- `cost_need_price` 恢复为有效 i18n key，不删除四语言文案。
- 新增 cost series 缺价格回归测试。

## Verification

- 48 项 usage 测试、198 assertions 通过；`tsc --noEmit` 通过；非 `.agents` `git diff --check` 通过。
