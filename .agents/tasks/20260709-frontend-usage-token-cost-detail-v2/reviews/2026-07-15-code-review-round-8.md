# 前端代码评审 Round 8

## 评审结论

- Reviewer: OpenCode `plan` agent / `deepseek-v4-flash-free`
- Verdict: `ready_with_updates`
- Scope: 当前完整非 `.agents` 前端候选，重点检查 token/cost 双算、unknown 归零、coverage、旧后端、图表/表格/弹窗/导出语义分叉。

## Findings 与处置

- `F-R8-001` (`low`, accepted): `CredentialStatsCard` 的 `!hasPrices && hasTokenRows` 提示在 `hasPrices = Boolean(filteredUsage)` 后永久不可达。已移除死分支、`hasTokenRows` 和无效 `hasPrices` prop。
- `F-R8-002` (`low`, rejected): 建议价格表单新增独立 reasoning price。既定产品契约把 reasoning 金额归入输出金额，`reasoningUsdPer1M` 仅为可选兼容字段；未配置时明确回退 output price，且已有测试，不扩大 UI 字段。
- `F-R8-003` (`low`, rejected): 英文 unconfigured 文案被认为不清晰。实际文案已为 `Pricing not set`，与中文“未配置价格”一致，无需修改。
- `F-R8-004` (`low`, rejected): 建议补 unknown/null 测试。现有 `cost.test.ts` 已覆盖 missing usage 和 total-only usage 均返回 `unknown_usage + totalCostUsd:null`。

## Verification

- 主会话核验全部候选 finding，只修复有真实代码证据的死分支。
- 修复后 usage 聚焦测试和 type-check 通过。
