# 前端计划 Round 1 独立评审与处置

## Review Summary

- Reviewer: independent subagent plan review
- Verdict: `changes_requested`
- Scope: `.agents/tasks/20260709-frontend-usage-token-cost-detail-v2/` 计划文档与 usage 前端源码抽查

## Findings Disposition

### F-001

- Disposition: accepted
- Summary: exact price key、official defaults、user override 和旧价格迁移契约不够明确，可能导致 model-only key 误命中默认价格或覆盖语义不稳定。
- Fix: 设计和计划补充 `PriceKey = provider:model` exact、`legacy:${model}` fallback、`officialDefaults`、`userOverrides`、`resolvedPrice`、restore default / delete override 行为和迁移断言。

### F-002

- Disposition: accepted
- Summary: 仓库没有 test script，计划不能依赖旧的条件式测试措辞。
- Fix: 计划要求新增 `test:usage`，使用 Bun 内置 runner 运行 `normalization.test.ts` 与 `cost.test.ts`，并把 `bun run test:usage` 纳入最终验证。

### F-003

- Disposition: accepted
- Summary: 计划引用不存在的旧 overview chart 文件。
- Fix: 计划改为读取/修改真实存在的 `src/components/usage/UsageChart.tsx` 与 `src/components/usage/hooks/useChartData.ts`。

### F-004

- Disposition: accepted
- Summary: `.agents/README.md` 当前活跃任务入口仍指向旧的上游吸收任务。
- Fix: 当前活跃任务入口改为 `tasks/20260709-frontend-usage-token-cost-detail-v2/task.md`。

### F-005

- Disposition: accepted
- Summary: 计划遗漏 `src/components/usage/hooks/useUsageData.ts`，而该文件当前负责 `modelPrices` 状态与 `loadModelPrices/saveModelPrices` 持久化。
- Fix: 计划将 `useUsageData.ts` 纳入任务 2，明确它负责加载 resolved prices、保存 user overrides，并与 `PriceSettingsCard` 的来源展示保持一致。
