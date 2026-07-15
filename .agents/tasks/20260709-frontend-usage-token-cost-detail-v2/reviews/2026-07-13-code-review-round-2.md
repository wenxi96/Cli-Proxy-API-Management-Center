# 前端代码评审 Round 2

## 评审结论

- Reviewer: `019f59f7-d6a5-76e2-b42b-4431cdd0b92a`
- Verdict: `changes_requested`
- Scope: 当前 `dev` 工作区相对 `HEAD` 的非 `.agents` 前端改动。

## Round 1 Closure

- `F-001`: 已闭环。total-only usage 成本返回 `unknown_usage`，不再显示 `$0.00`。
- `F-002`: 已闭环。已补 total-only、separate reasoning 缺价/有价、included reasoning 不双算测试。

## Findings

### F-R2-001

- Severity: High
- Summary: 已计价请求和未配置请求混合时，聚合成本被降为 `unconfigured` 且总额变成 `null`。
- Impact: 凭证统计、详情弹窗和总览会隐藏已知部分成本，违反 partial 展示 known cost 并提示缺失项的语义。
- Disposition: 已修复。聚合层在存在已知金额且同时存在缺价/未知请求时返回 `partial`，保留 known cost sum 并汇总 missing models/components。
- Regression: `preserves known cost sum when aggregate includes unconfigured details`

### F-R2-002

- Severity: Medium
- Summary: 默认价格表与当前 OpenAI 官方价格页存在不完整/来源确认问题。
- Impact: 部分当前官方模型可能仍为 unconfigured，或未记录官方来源核验。
- Disposition: 已修复。使用 OpenAI 官方 pricing 页核验：旧 `chat-latest`/`codex` alias 在官方页仍存在，予以保留；新增官方页确认的 `gpt-5.6-*`、`gpt-5.5*`、`gpt-5.4*` 标准价条目。
- Source: https://developers.openai.com/api/docs/pricing
- Regression: `has official defaults for current OpenAI GPT-5.6 and GPT-5.4 models`

## Verification

- `PATH=/home/cheng/.bun/bin:$PATH bun run test:usage`
- `PATH=/home/cheng/.bun/bin:$PATH bun run type-check`
- `PATH=/home/cheng/.bun/bin:$PATH bun run build`
- `git diff --check`

## Notes

- Round 2 reviewer 运行 `bun run lint` 失败，报告为 32 个既有/仓库级 lint 错误，且示例 `useUsageData.ts:54` 在 `HEAD` 已存在；本轮未将其作为阻塞项处理。
- `bun run build` 未产生 Git 跟踪的 `dist` 改动。

## Next

派发前端代码 Round 3 独立评审，确认 Round 2 修复无新问题。
