# 前端代码评审 Round 3

## 评审结论

- Reviewer: `019f5a09-7b9a-7551-9589-d562907d9d28`
- Verdict: `changes_requested`
- Scope: 当前 `dev` 工作区相对 `HEAD` 的非 `.agents` 前端改动。

## Round Closure

- `F-001`: 已闭环。total-only usage 成本返回 `unknown_usage`。
- `F-002`: 已闭环。total-only、separate reasoning、included reasoning 测试覆盖已补。
- `F-R2-001`: 已闭环。known cost + incomplete 聚合返回 `partial` 并保留 known cost。
- `F-R2-002`: 未完全闭环。默认 OpenAI price catalogue 仍缺 Standard 档一致性，见 `F-R3-001`。

## Findings

### F-R3-001

- Severity: High
- Summary: 默认 OpenAI 价格表仍不符合官方 Standard pricing，部分模型会低估金额，GPT-5.6 cache creation 会错误缺价。
- Impact: deep-research / computer-use 成本可能标记为 complete 但低估；GPT-5.6 cache creation 官方有价却显示缺组件。
- Disposition: 已修复。`openaiPrice` 支持 `cacheCreationUsdPer1M`；GPT-5.6 系列补 cache creation/write；`o3-deep-research`、`o4-mini-deep-research`、`computer-use-preview` 调整为官方 Standard 档。
- Source: https://developers.openai.com/api/docs/pricing
- Regression: `calculates GPT-5.6 cache creation with official standard pricing`; `uses official standard pricing for deep research and computer use defaults`

## Verification

- `PATH=/home/cheng/.bun/bin:$PATH bun run test:usage`
- `PATH=/home/cheng/.bun/bin:$PATH bun run type-check`
- `PATH=/home/cheng/.bun/bin:$PATH bun run build`
- `git diff --check`

## Notes

- Round 3 reviewer 再次确认 `bun run lint` 被既有 32 个 `react-hooks` lint errors 阻断；该问题不属于本轮新增改动。
- 官方价格页是动态页面；本轮按 2026-07-13 当前 `https://developers.openai.com/api/docs/pricing` Standard rows 修正。

## Next

派发前端代码 Round 4 独立评审，确认 `F-R3-001` 闭环且没有新增问题。
