# 凭证统计 Token 与金额明细展示设计方案

## 需求结论

前端可以在现有使用统计页中新增凭证维度 token 与金额展示。推荐方案是后端提供 `usage.auths` 聚合和单认证文件明细分页接口，前端负责展示、交互和基于本地模型价格表计算估算金额。

## 当前实现分析

### 已具备能力

- `UsagePage` 已集中加载 usage、配置、模型价格和时间范围过滤结果。
- `CredentialStatsCard` 已能把 usage details 按凭证聚合请求数和成功率。
- `RequestEventsDetailsCard` 已能展示请求事件明细，并包含 token breakdown、延迟、思考强度、模型和 auth_index。
- `utils/usage.ts` 已有金额计算工具，价格单位为每 1M tokens 美元。
- `Modal`、`Button`、`Select`、`EmptyState` 等基础组件可复用。

### 当前缺口

- 凭证统计表没有 token breakdown 和金额列。
- 凭证统计行没有详情交互。
- 单凭证明细需要复用请求事件的格式化逻辑，否则两处字段和展示容易漂移。
- `usageApi` 没有认证文件维度明细接口封装。
- i18n 缺少凭证 token、金额、详情弹窗、分页、无价格等文案。

## 展示设计

### 凭证统计表

每行表示一个凭证身份，主键为 `auth_index` 或 `resolveSourceDisplay()` 返回的 identity key。`auth_index` 作为普通字符串处理，不假设固定长度或十六进制格式。列建议：

- 凭证：显示 DisplayName/文件名，副文本显示 provider 类型。
- 请求次数：总数，并保留成功/失败拆分。
- 成功率：沿用现有颜色分级。
- 输入 Tokens
- 输出 Tokens
- 推理 Tokens
- 缓存 Tokens
- 总 Tokens
- 估算金额
- 操作：查看明细，或整行可点击并提供可访问按钮。

金额规则：

- 有模型价格时，使用 `calculateCost(detail, modelPrices)` 累加。
- 金额聚合必须同步输出价格覆盖状态，避免混合价格场景被展示成完整金额：
  - `complete`: 当前凭证涉及的有 token 模型均已配置价格，可正常显示估算金额。
  - `partial`: 至少一个有 token 模型已配置价格，且至少一个有 token 模型缺少价格；显示已覆盖部分的估算金额，同时标记“部分价格未配置”，不得当作完整金额。
  - `unconfigured`: 当前凭证涉及的有 token 模型均缺少价格；显示 `--` 或“未配置价格”，不显示 `$0.00` 造成误解。
- 聚合结果需要保留 `missing_price_models` 或等价的去重模型列表/数量，供表格 tooltip、弹窗摘要和验证使用。
- 列标题和提示文案使用“估算金额”，不写“账单实收”。
- 总 token 口径必须与后端 auth usage 聚合一致：优先使用 provider/backend 返回的 `total_tokens`；缺失时按 `input_tokens + output_tokens + reasoning_tokens` 兜底；只有主计数均为 0 且仅存在 cached token 信号时，才把 cached token 作为 total 兜底。`cached_tokens` 默认是输入 token 的子集或折扣维度，不自动叠加到 total。

### 单凭证明细弹窗

入口：

- 点击凭证统计行或“查看明细”按钮。

弹窗内容：

- 标题：凭证名 + provider 类型。
- 摘要：请求数、成功/失败、总 tokens、估算金额和价格覆盖状态。
- 明细表：时间、模型、结果、延迟、输入/输出/推理/缓存/总 token、估算金额和缺失价格提示。
- 如果该凭证为 `partial`，摘要区展示缺失价格模型数量；详情中可展示去重模型列表，避免用户把金额理解为完整账单。
- 分页：后端接口可用时使用 `limit/offset`；本地降级时最多渲染前 500 条并提示。

交互状态：

- loading：首次加载明细时显示加载态。
- empty：没有调用明细时显示空状态。
- error：后端明细接口失败但本地 usage 可用时自动降级；完全失败时显示错误提示。

## 数据接入设计

### 后端新契约优先

新增 service 方法：

```ts
usageApi.getAuthUsageRequests(authIndex, {
  limit,
  offset,
  model,
  failed,
  from,
  to,
});
```

service 拼接 URL 时必须对 `authIndex` 使用 `encodeURIComponent` 或等价编码；如果后端落地时把明细接口调整为 query 参数方案，前端 service 必须同步切换，不在组件层直接拼接路径。

预期响应：

```ts
interface AuthUsageRequestsResponse {
  auth_index: string;
  total: number;
  limit: number;
  offset: number;
  items: AuthUsageRequestItem[];
}

interface AuthUsageRequestItem {
  timestamp: string;
  endpoint?: string;
  model: string;
  source: string;
  auth_index: string;
  failed: boolean;
  latency_ms?: number;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
  estimated_cost_usd?: number | null;
}

type CredentialCostStatus = 'complete' | 'partial' | 'unconfigured';

interface CredentialUsageCostSummary {
  estimated_cost_usd: number | null;
  cost_status: CredentialCostStatus;
  missing_price_models: string[];
}
```

### 旧后端兼容

如果后端没有 `usage.auths`：

- `CredentialStatsCard` 继续从 `collectUsageDetails(usage)` 聚合，但必须使用与后端一致的 token normalization helper，不直接复用会把 cached token 自动叠加到 total 的旧逻辑。

如果明细接口返回 404 或不可用：

- 弹窗从当前 `usage` 中按 `auth_index` 或 identity key 本地过滤。
- 本地过滤结果按时间倒序展示，最多渲染固定数量，并显示性能提示。

## 组件拆分

建议新增：

- `src/components/usage/CredentialUsageDetailsModal.tsx`
  - 负责弹窗、分页、加载态、空态、错误态。
- `src/components/usage/credentialUsage.ts`
  - 负责从 usage details 或后端 response 构造统一行数据，并封装后端一致的 token total 归一化和价格覆盖状态聚合。

建议修改：

- `CredentialStatsCard.tsx`
  - 增加 `modelPrices`、`hasPrices` props。
  - 聚合 token breakdown、cost、`cost_status` 和 `missing_price_models`。
  - 管理选中凭证状态并打开弹窗。
- `RequestEventsDetailsCard.tsx`
  - 如有必要，抽出行构造工具，避免重复。
- `UsagePage.tsx`
  - 向 `CredentialStatsCard` 传入 `modelPrices` 和 `hasPrices`。
- `services/api/usage.ts`
  - 增加单凭证明细 API。
- `utils/usage.ts`
  - 增加按 auth_index 聚合的纯函数，便于组件和测试复用；如需调整现有 `extractTotalTokens()`，必须评估使用统计页其他图表的回归影响，否则在 `credentialUsage.ts` 中提供凭证统计专用 normalizer。
- `UsagePage.module.scss`
  - 增加表格宽列、可点击行、弹窗表格样式。
- `src/i18n/locales/*.json`
  - 增加所有新增文案。

## 兼容与安全

- 不展示原始 source 中可能包含的密钥；继续使用现有 `normalizeUsageSourceId()` 和 `resolveSourceDisplay()`。
- 不把 client IP 放入弹窗默认列。
- 弹窗明细仅展示统计元数据，不展示 prompt/response。
- 旧后端可用时继续展示基础统计，避免页面空白。

## 验证方案

- `bun run type-check`
- `bun run build`
- 人工验证：
  - 有 usage details 且有 auth_index 时，凭证统计展示 token 与金额。
  - 当 detail 缺失 `total_tokens` 且同时存在 `input_tokens` 与 `cached_tokens` 时，凭证统计 total 与后端归一化一致，不重复叠加 cached token。
  - 未配置模型价格时，金额列为未配置状态。
  - 同一个凭证同时包含已配置价格模型和未配置价格模型时，金额列显示已覆盖部分的估算值，并标记“部分价格未配置”，缺失模型可在 tooltip 或弹窗摘要中查看。
  - 点击凭证行打开弹窗，明细只包含该凭证。
  - 后端明细接口不可用时，前端降级到本地过滤。
