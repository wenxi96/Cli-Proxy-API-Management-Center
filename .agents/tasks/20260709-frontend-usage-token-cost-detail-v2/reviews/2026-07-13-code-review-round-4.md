# 前端代码评审 Round 4

## 评审结论

- Reviewer: `019f5a13-2674-7843-84dd-d88379730d56`
- Verdict: `changes_requested`
- Scope: 当前 `dev` 工作区相对 `HEAD` 的非 `.agents` 前端改动，重点复核 Round 3 价格表修复和价格设置 UI。

## Round Closure

- `F-001`: 已闭环。total-only usage 成本返回 `unknown_usage`。
- `F-002`: 已闭环。total-only、separate reasoning、included reasoning 测试覆盖已补。
- `F-R2-001`: 已闭环。known cost + incomplete 聚合返回 `partial` 并保留 known cost。
- `F-R2-002`: 已闭环。默认 OpenAI 价格表已补 GPT-5.6/5.5/5.4，并对无法稳定核验的专用模型保持 unconfigured。
- `F-R3-001`: 已闭环。GPT-5.6 cache creation/write 已补；deep-research/computer-use 不再使用未核验默认价。

## Findings

### F-R4-001

- Severity: High
- Summary: `o3-deep-research`、`o4-mini-deep-research`、`computer-use-preview` 默认价无法从当前官方 pricing 页稳定核验，继续写入默认价会让成本显示为 complete 并可能低估。
- Impact: 专用模型的估算金额可能被误当作官方覆盖价格，影响凭证成本统计可信度。
- Disposition: 已修复。删除这些专用模型的 official default 条目；对应测试改为断言 `unconfigured`，由用户 override 显式配置后才计算。
- Regression: `leaves specialized models unconfigured when standard pricing is not confirmed`

### F-R4-002

- Severity: Medium
- Summary: `PriceSettingsCard` 只有一个缓存价格输入，会覆盖 `cacheReadUsdPer1M` 和 `cacheCreationUsdPer1M` 两种不同价格。
- Impact: GPT-5.6 等存在缓存写入价格的模型，用户编辑价格后可能丢失 cache read/write 的区分，导致缓存金额估算错误。
- Disposition: 已修复。新增 `src/utils/usage/priceForm.ts`，表单状态拆分为 `cacheRead` 和 `cacheCreation`；新增价格设置 UI 的缓存读取/缓存写入两个输入和展示字段；补齐四语言 i18n。
- Regression: `preserves separate cache read and cache creation values in price form overrides`

## Verification

- `PATH=/home/cheng/.bun/bin:$PATH bun run test:usage` 通过，20 tests / 97 assertions。
- `PATH=/home/cheng/.bun/bin:$PATH bun run type-check` 通过。
- `PATH=/home/cheng/.bun/bin:$PATH bun run build` 通过。
- `git diff --check` 通过。

## Notes

- `dist/` 由构建刷新但仍为 ignored，未进入候选提交。
- 本轮没有运行 `bun run lint`；既有 `react-hooks` lint errors 已在前序评审记录为非本轮新增问题。

## Next

派发前端代码 Round 5 独立评审，确认 `F-R4-001`、`F-R4-002` 已闭环且没有新增问题。
