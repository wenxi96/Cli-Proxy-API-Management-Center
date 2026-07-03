# Findings

## 已确认事实

- `src/pages/UsagePage.tsx` 已把 `filteredUsage`、配置凭证列表和 openai provider 列表传给 `RequestEventsDetailsCard` 与 `CredentialStatsCard`。
- `src/components/usage/CredentialStatsCard.tsx` 当前会调用 `authFilesApi.list()` 建立 `auth_index` 到凭证名称/类型的映射，并使用 `collectUsageDetails(usage)` 聚合请求数和成功率。
- `CredentialStatsCard` 当前列只有凭证、请求次数、成功率。
- `src/components/usage/RequestEventsDetailsCard.tsx` 已有请求事件行构造、模型/来源/auth_index 筛选、CSV/JSON 导出和 token breakdown 展示。
- `src/utils/usage.ts` 已有 `collectUsageDetails()`、`extractTotalTokens()`、`calculateCost()`、`formatUsd()`、`loadModelPrices()` 等工具，金额计算基于前端 localStorage 中的模型价格。
- `src/services/api/usage.ts` 当前只提供 `/usage`、`/usage/export`、`/usage/import` 和 `getKeyStats()`，没有认证文件 usage 明细接口。
- `src/components/ui/Modal.tsx` 可复用为单凭证明细弹窗。

## 设计判断

- 前端第一阶段应复用现有模型价格表计算估算金额，避免等待后端共享价格表设计。
- 凭证统计的主关联键应为 `auth_index`，展示名和类型继续走 `resolveSourceDisplay()`，以保留 DisplayName 和 provider 类型展示。
- `auth_index` 需要按普通字符串处理。后端本地生成值通常是稳定 hash，但已有运行态或外部提供的 Index 可能不是固定十六进制格式；前端 service 调用明细接口时必须 URL encode，不能用格式假设过滤或拼接。
- 明细弹窗可以抽取 `RequestEventsDetailsCard` 中的行构造逻辑，避免同一套 token/延迟/思考强度格式化逻辑分叉。
- 表格行点击打开弹窗时，应保留键盘可达性，或提供明确的详情按钮。
- 前端现有 `extractTotalTokens()` 在缺失 `total_tokens` 时会把 cached token 叠加进 total；后端当前归一化优先使用 `input + output + reasoning`，仅在主计数均为 0 时才用 cached token 兜底。凭证统计本地降级路径必须显式使用后端一致口径，避免与 `usage.auths` 聚合结果不一致。
- 现有 `calculateCost()` 在单个模型缺少价格时返回 0。凭证聚合如果只累加数字，会在同一凭证混合已配置价格模型和未配置价格模型时低估金额且无法区分“免费/零 token”和“价格缺失”；前端必须额外维护 `complete | partial | unconfigured` 价格覆盖状态和缺失价格模型列表。

## 需在实现时复核

- 是否已有通用 Table/Modal 组合样式适合宽表格弹窗；如没有，应在 `UsagePage.module.scss` 中补最小样式，不重构全页。
- 后端新接口上线前，前端需要对 404/旧响应做兼容降级。
- 如果弹窗使用后端分页接口，需要确定分页按钮、加载态和错误态文案。
- 混合价格覆盖场景需要在工具函数或组件测试中单独覆盖，不能只验证“全部有价格”和“全部无价格”两种状态。
