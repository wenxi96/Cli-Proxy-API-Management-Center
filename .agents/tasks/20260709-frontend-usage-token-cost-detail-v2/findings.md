# Findings

## 已确认事实

- 历史任务 `20260703-frontend-auth-usage-token-cost-statistics` 已 `released`，本轮需求为后续增强，必须新建任务目录。
- 当前任务在 `dev` 分支创建；`.agents` 治理文档不得进入 `master`。
- 上一轮前端 v6 方案独立复审结果为 `ready`，可作为本任务设计契约来源。
- 当前前端已存在 usage 凭证统计、单凭证明细、价格设置和成本展示，但 normalization 与 cost status 需要统一。

## 待实现中确认

- 仓库当前无 test script；本任务需要新增 `test:usage`，用 Bun 内置 test runner 覆盖 normalization/cost fixtures。
- 默认官方价格表首批覆盖哪些 `provider:model` exact key，必须以可确认价格为准。
- 旧 localStorage 价格配置迁移是否需要保留原 key 作为回滚读取。

## Round 1 计划评审已采纳问题

- `F-001`: 已采纳。设计和计划补充 `PriceKey = provider:model` exact、legacy fallback、official defaults / user overrides / resolved prices、恢复默认与删除覆盖语义。
- `F-002`: 已采纳。计划要求新增 `test:usage`，使用 Bun 内置 runner 覆盖 normalization / cost / migration fixture。
- `F-003`: 已采纳。计划移除不存在的旧 overview chart 文件引用，改为真实存在的 `UsageChart.tsx` 与 `hooks/useChartData.ts`。
- `F-004`: 已采纳。`.agents/README.md` 当前活跃任务入口改为本任务。
- `F-005`: 已采纳。计划补入 `src/components/usage/hooks/useUsageData.ts`，明确其负责加载 resolved prices 与保存 user overrides。

## Round 2 计划评审已采纳问题

- `F-R2-001`: 已采纳。设计和计划补充缺失价格组件不能隐式归零，成本结果需记录 `missingPriceComponents`，并用 `cost.test.ts` 覆盖 model price 存在但 cache/read/write 或 separate reasoning 组件缺失的场景。

## 代码评审 Round 8-10

- Round 8 接受并移除凭证统计中永久不可达的 `hasPrices` 提示分支；reasoning price、英文文案和 unknown/null 测试三个候选经核验不成立，未扩大产品契约。
- Round 9 修复 cost trend 对 missing pricing 与 missing usage 的提示语义分叉：`CostSeries` 携带 canonical `costStatus`，只有 unconfigured 显示设置价格提示。
- Round 10 独立复审结论为 `Findings: None`、`Verdict: ready`。
- 最终 reasoning 金额决策：reasoning token 明细单独展示，但金额归入 output cost；仅当数据/override 提供独立 reasoning price 时使用，否则回退 output price。

## 代码评审 Round 11-12

- 主线程复核发现 normalization 与 stored price 直接使用 `Number(value)`，会把 boolean、array 和 object 宽松转换为数字；已统一为严格非负十进制解析，同时兼容规范数字字符串。
- Round 11 发现 Bun matcher 类型声明缺少 `toBeUndefined`、aggregate `total_tokens` 和 `StatCards` 仍有宽松转换、价格表单仍接受指数/十六进制语法；三项均已修复。
- aggregate 负向测试覆盖 array、boolean、object，数字字符串继续兼容；价格表单测试覆盖拒绝 `1e3`、`0x10`、`.5`、`1.`。
- Round 12 最终独立复审结论为 `Findings: None`、`Verdict: ready_with_updates`；该 verdict 仅表示静态代码无 blocker，usage tests 与 type-check 仍待执行。

## 提交前动态验证

- 2026-07-15 使用 Bun 1.3.11 执行 `bun run test:usage`，52 个测试、225 个断言全部通过。
- `bun run type-check` 与 `bun run build` 均通过；Vite 成功转换 745 个模块并生成 single-file `dist/index.html`。
- `git diff --check` 通过；`dist/` 保持 ignored，构建没有向候选提交加入非预期文件。
- Verification: 详见 `progress.md` 的 `2026-07-15 16:23 前端提交前动态验证` 与 `reviews/2026-07-15-edit-batch-review.md`。
