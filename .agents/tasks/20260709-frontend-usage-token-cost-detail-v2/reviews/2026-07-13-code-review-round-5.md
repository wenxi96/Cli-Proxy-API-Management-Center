# 前端代码评审 Round 5

## 评审结论

- Reviewer: `019f5a23-a8e2-7661-bbca-2e18c74a05fd`
- Verdict: `changes_requested`
- Scope: 当前 `dev` 工作区相对 `HEAD` 的非 `.agents` 前端改动，重点复核 Round 4 修复和整体 usage token/cost 语义。

## Round Closure

- `F-R4-001`: 已闭环。无法稳定核验官方价的 deep-research / computer-use 专用模型保持 `unconfigured`。
- `F-R4-002`: 已闭环。价格设置表单已拆分 `cacheRead` / `cacheCreation`。

## Findings

### F-R5-001

- Severity: High
- Summary: mixed incomplete aggregate 中如果只有 known zero subtotal，仍可能显示 `$0.00`。
- Impact: “零成本 complete 明细 + unknown_usage/unconfigured 明细”会被误读为完整 0 成本，低估成本。
- Disposition: 已修复。`aggregateUsageCosts` 对 partial aggregate 增加 known positive subtotal 判断；存在 incomplete detail 且已知 subtotal 为 0 时保持 `null`，UI 显示 `--`。
- Regression: `keeps partial aggregate zero subtotal unknown when incomplete details remain`

### F-R5-002

- Severity: Medium
- Summary: unsplit cache aliases 使用 first-wins，`cached_tokens: 0` 会覆盖 legacy `cache_tokens: >0`。
- Impact: cache token、cache ratio、cache cost 和 token breakdown 可能低估。
- Disposition: 已修复。新增 `readMaxNonNegativeNumber`，unsplit cache aliases 取最大非负值。
- Regression: `normalizes unsplit cache aliases by maximum non-negative value`

### F-R5-003

- Severity: Low
- Summary: 请求事件表格只显示 `totalCostUsd`，partial subtotal 与 complete total 容易混淆。
- Impact: 用户可能把 partial subtotal 误读为完整估算金额。
- Disposition: 已修复。请求事件成本列复用成本状态 badge，非 complete 状态显示状态标签和缺失项 tooltip；CSV/JSON 已有状态字段，导出结构保持不变。
- Regression: TypeScript/build 覆盖组件类型与渲染结构。

## Verification

- `PATH=/home/cheng/.bun/bin:$PATH bun run test:usage` 通过，22 tests / 106 assertions。
- `PATH=/home/cheng/.bun/bin:$PATH bun run type-check` 通过。
- `PATH=/home/cheng/.bun/bin:$PATH bun run build` 通过。
- `git diff --check` 通过。

## Notes

- `dist/` 由构建刷新但仍为 ignored，未进入候选提交。

## Next

派发前端代码 Round 6 独立复审，确认 `F-R5-001`、`F-R5-002`、`F-R5-003` 已闭环且没有新增问题。
