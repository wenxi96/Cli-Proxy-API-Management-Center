# 前端 Usage Token 与金额明细展示升级设计

## 方案来源

- 用户目标: 保留原有统计信息，在此基础上新增每个凭证具体请求 token 明细、缓存用量、缓存比、输入/输出/缓存/总估算金额明细和单凭证明细。
- 方案复审结论: 前端 v6 独立复审 verdict 为 `ready`，上一轮 low finding 已关闭。
- 历史前置: `20260703-frontend-auth-usage-token-cost-statistics` 已发布第一阶段凭证 token/cost 展示，本任务为第二阶段语义升级。

## 关键设计

### 1. NormalizedUsageDetail 单一消费形态

前端需要新增统一 normalization 层，例如 `src/utils/usage/normalizeUsageDetails.ts` 或扩展现有 `src/utils/usage.ts`。所有组件、store、export、chart 都消费 normalization 后的数据，不再重复解析原始 backend detail。

推荐字段：

- 顶层: `requestId`、`clientIp`、`timestamp`、`endpoint`、`model`、`provider`、`executorType`、`authType`、`modelAlias`、`source`、`authIndex`、`failed`、`latencyMs`
- tokens: `inputTokens`、`outputTokens`、`reasoningTokens`、`cachedTokens`、`cacheReadTokens`、`cacheCreationTokens`、`totalTokens`、`reportedTotalTokens`、`computedTotalTokens`、`tokenUsageSource`、`cacheSplitStatus`、`reasoningCostMode`、`hasKnownUsage`
- cost: `inputCostUsd`、`outputCostUsd`、`cacheCostUsd`、`totalCostUsd`、`costStatus`、`missingPriceModels`、`missingPriceComponents`

### 2. Deterministic Cost Status

成本状态按严重度聚合：

1. `unknown_usage`
2. `unconfigured`
3. `partial`
4. `complete`

规则：

- `unknown_usage`: 没有可用 token facts 或无法判断 usage；显示 `--`、gap 或 null，不画 0。
- `unconfigured`: 有 token facts 但没有可用价格；显示未配置，不画 0。
- `partial`: 仅部分 exact `PriceKey` 或必要价格组件有价格；显示 known cost，并明确提示缺失的模型或组件。
- `complete`: usage 和价格均覆盖，显示完整估算金额。

### 3. Price Key 与 Override Model

价格必须先解决“默认价格”和“用户覆盖”边界，避免旧的 model-only key 误命中官方价格。

- `PriceKey`: provider 存在且 model 非空时使用 exact key：`${provider}:${model}`，例如 `openai:gpt-5`。
- Legacy fallback key: 仅当 provider 缺失或旧数据无法确定 provider 时使用 `legacy:${model}`；legacy key 只能承载用户迁移配置或人工 override，不作为官方默认价格命中。
- `officialDefaults: Record<PriceKey, OfficialModelPrice>`：前端静态默认价格表，只包含可确认官方价格的 exact key。
- `userOverrides: Record<PriceKey, UserModelPriceOverride>`：用户本地覆盖配置，可覆盖 official default，也可为 unknown model 手动补价。
- `resolvedPrice = userOverrides[key] ?? officialDefaults[key]`；若 exact key 无 default 且无 override，则状态为 `unconfigured`。
- “恢复默认”只删除该 exact key 的 user override，并回落到 official default；“删除覆盖”不得删除 official default。
- 旧 localStorage v2 `{ prompt, completion, cache }` 迁移为 user override，并以 legacy fallback key 保存；不能写入 official defaults。
- 价格设置 UI 必须展示价格来源：official default、user override、legacy fallback 或 unconfigured。

### 4. Official Default Price Catalogue

前端内置静态默认价格表：

- 文件建议: `src/utils/usage/pricingDefaults.ts`
- key: `provider:model` exact `PriceKey`，例如 `openai:gpt-5`。
- 字段: `inputUsdPer1M`、`outputUsdPer1M`、`cacheReadUsdPer1M`、`cacheCreationUsdPer1M`、`defaultsVersion`、`sourceLabel`。
- 用户本地 override 优先于 defaults。
- 不从后端拉默认价格。
- localStorage 需要版本化迁移，将旧 `{ prompt, completion, cache }` 映射到新 `{ input, output, cacheRead/cacheCreation }`。
- 价格组件缺失不能隐式归零；只有显式配置为 0 的组件才表示 known zero。若请求包含 cache read / cache creation / separate reasoning usage，而对应价格组件缺失，成本状态必须为 `partial` 或 `unconfigured`，并记录 `missingPriceComponents`。

### 5. Reasoning 与 Cache Cost 语义

- `reasoning_tokens` 默认包含在 output 成本内，不额外计费，除非 `reasoning_cost_mode=separate`。
- `cached_tokens` 优先作为 cache read 总量；如果后端提供 `cache_read_tokens` / `cache_creation_tokens`，使用更细字段。
- `inputCostUsd` 应按 non-cached input 计算，避免 cached tokens 同时按 input 和 cache 双算。
- `cacheCostUsd` 可拆成 read/creation；UI 第一阶段至少展示缓存金额汇总，tooltip 或明细可展示读/写。

### 6. 展示与导出

- 凭证统计表: 请求数、成功率保持现状，新增 token breakdown、缓存比、cost breakdown。
- 单凭证明细弹窗: 展示每条请求的 token/cost breakdown，支持分页或本地限制。
- 请求事件详情: 导出 CSV/JSON 包含新字段，unknown usage 输出空值而不是 0。
- Cost trend 和 sparkline: 只对 known cost 画线；unknown/unconfigured bucket 产生 gap 或提示，不用 token series 冒充 cost。
- 价格设置: 移除“提示/补全”显示文案，改为输入/输出/缓存。

### 7. 可执行测试 Harness

当前仓库 `package.json` 只有 `type-check`、`build`、`lint`，没有测试脚本。本任务必须显式新增轻量可执行测试入口，而不是把测试写成“如可用”。

- 建议新增 `test:usage`: `bun test src/utils/usage/normalization.test.ts src/utils/usage/cost.test.ts`。
- 测试文件只依赖 Bun 内置 test runner，不引入额外测试框架。
- fixture 必须覆盖新后端 detail、旧后端 detail、缺 usage、缺价格、部分价格、价格组件缺失、cache read/creation、reasoning included/separate、legacy price migration。
- 验证命令必须包含 `bun run test:usage`、`bun run type-check`、`bun run build`、`git diff --check`。

## 后端契约依赖

新后端 request item 顶层字段：

`request_id, client_ip, timestamp, endpoint, model, provider, executor_type, auth_type, model_alias, source, auth_index, failed, latency_ms, estimated_cost_usd`

`tokens` 内字段：

`input_tokens, output_tokens, reasoning_tokens, cached_tokens, cache_read_tokens, cache_creation_tokens, total_tokens, reported_total_tokens, computed_total_tokens, token_usage_source, cache_split_status, reasoning_cost_mode`

旧后端缺字段时：

- 保留现有 details 聚合能力。
- 对无法确定的 usage/cost 使用 `unknown_usage` 或 null。
- 不让旧字段缺失导致页面崩溃。

## 风险与处理

- 原有统计项回归: 所有 overview/model/API/request stats 继续基于 normalized facts 或原有兼容字段计算，不能因新增 status 影响原请求计数。
- 价格迁移风险: localStorage 新 key 版本化，旧 key 只读迁移，不直接丢弃用户价格。
- UI 拥挤风险: 凭证统计表使用紧凑列、tooltip 和横向滚动，不在小屏重叠。
- 低估误导风险: partial 必须显式提示缺失价格模型；unknown/unconfigured 不展示为 0。
- 价格组件缺失风险: 有 model 价格但缺 cache read/write 或 separate reasoning 组件时，不能按 0 计算成 complete，必须保留 `missingPriceComponents` 并降级为 partial/unconfigured。

## 验证策略

- 工具测试或 fixture: 通过 `bun run test:usage` 覆盖新后端 detail、旧后端 detail、缺 usage、缺价格、部分价格、价格组件缺失、cache/reasoning 混合、legacy price migration。
- 类型检查: `bun run type-check`。
- 构建: `bun run build`。
- Diff 检查: `git diff --check`。
- 人工交互: 凭证统计表、价格设置、单凭证明细弹窗、导出和趋势图。
