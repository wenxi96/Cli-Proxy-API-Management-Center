# 前端代码评审 Round 1

## 评审结论

- Reviewer: `019f59e9-f9e7-7fa2-b00d-a48d9173cec1`
- Verdict: `changes_requested`
- Scope: 当前 `dev` 工作区相对 `HEAD` 的非 `.agents` 前端改动，包含 `src/utils/usage/*` 未跟踪文件。

## Findings

### F-001

- Severity: High
- Summary: 只有 `total_tokens` 的 usage 被标记为 complete `$0.00` cost。
- Impact: 旧数据或 summary-only 后端数据会显示为可计算 0 成本，违反 unknown/unconfigured 不展示为 0 的计划要求。
- Disposition: 已修复。`calculateUsageCost` 在可计费拆分组件为 0 且 `totalTokens > 0` 时返回 `unknown_usage`，成本字段保持 `null`。
- Regression: `keeps total-only usage cost unknown instead of complete zero`

### F-002

- Severity: Medium
- Summary: usage-cost fixtures 不完整，缺少 total-only 和 reasoning 计费模式覆盖。
- Impact: `test:usage` 可能在关键低估风险回归时仍通过。
- Disposition: 已修复。补充 total-only、separate reasoning 缺价、有价、included reasoning 不重复计费测试。
- Regression: `reports separate reasoning price as partial when reasoning price is missing`; `calculates separate reasoning cost when reasoning price is configured`; `does not double-count reasoning when reasoning is included in output`

## Verification

- `PATH=/home/cheng/.bun/bin:$PATH bun run test:usage`
- `PATH=/home/cheng/.bun/bin:$PATH bun run type-check`
- `PATH=/home/cheng/.bun/bin:$PATH bun run build`
- `git diff --check`

## Next

派发前端代码 Round 2 独立评审，确认上述修复无新问题。
