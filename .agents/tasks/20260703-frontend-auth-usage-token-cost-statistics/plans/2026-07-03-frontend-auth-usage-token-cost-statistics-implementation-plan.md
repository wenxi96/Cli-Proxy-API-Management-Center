# 凭证统计 Token 与金额明细展示实施计划

- 目标: 在使用统计页的凭证统计功能中展示 token breakdown、估算金额，并支持点击单个凭证查看调用明细弹窗。
- 输入模式: approved-spec
- 需求来源: spec:.agents/tasks/20260703-frontend-auth-usage-token-cost-statistics/specs/2026-07-03-frontend-auth-usage-token-cost-statistics-design.md
- Canonical Spec 路径: `.agents/tasks/20260703-frontend-auth-usage-token-cost-statistics/specs/2026-07-03-frontend-auth-usage-token-cost-statistics-design.md`
- 范围边界: usage 类型与 API service、凭证统计卡片、单凭证明细弹窗、样式、i18n、类型检查和构建验证；不改额度展示、不引入插件、不重做全页布局。
- 非目标: 不展示 prompt/response/原始密钥；不把估算金额称为真实账单；不迁移模型价格到后端持久化。
- 约束: `auth_index` 为主关联键且按普通字符串处理，不假设固定长度或十六进制格式；旧后端缺少新接口时需要兼容；宽表格在移动端不得内容重叠；新增文案需覆盖现有语言文件；本地降级聚合的 `total_tokens` 口径必须与后端 auth usage 聚合一致，不能把 cached tokens 重复叠加到 total；估算金额必须区分 `complete`、`partial`、`unconfigured` 三种价格覆盖状态，混合已配置/未配置价格模型时不得展示为完整金额。
- 细化层级: contract-first
- 执行路由: direct_inline
- 为什么使用该路由: 前端改动集中在使用统计页和 usage 工具，依赖后端契约但组件边界清晰，不需要多 agent 或 ULW 状态机。
- 升级触发条件: 如果需要重构整个 usage 页面布局、迁移模型价格持久化，或后端 API 契约发生不兼容变化，则暂停并更新 spec。

## 文件结构

- 新建:
  - `src/components/usage/CredentialUsageDetailsModal.tsx`
  - `src/components/usage/credentialUsage.ts`
- 修改:
  - `src/components/usage/CredentialStatsCard.tsx`
  - `src/components/usage/index.ts`
  - `src/pages/UsagePage.tsx`
  - `src/pages/UsagePage.module.scss`
  - `src/services/api/usage.ts`
  - `src/utils/usage.ts`
  - `src/i18n/locales/zh-CN.json`
  - `src/i18n/locales/zh-TW.json`
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/ru.json`
- 读取:
  - `src/components/usage/RequestEventsDetailsCard.tsx`
  - `src/components/ui/Modal.tsx`
  - `src/utils/sourceResolver.ts`
- 测试:
  - `bun run type-check`
  - `bun run build`

## 任务拆分

### 任务 1：补齐 usage 类型、API service 与聚合工具

- 目标: 为后端 `usage.auths` 和单认证文件明细接口建立前端类型、service 方法和本地聚合工具。
- 文件:
  - 新建: `src/components/usage/credentialUsage.ts`
  - 修改: `src/services/api/usage.ts`; `src/utils/usage.ts`
  - 读取: `src/components/usage/RequestEventsDetailsCard.tsx`
  - 测试: `bun run type-check`
- 依赖: 后端 API 契约已确认。
- 验证: 类型检查通过；工具函数能从 `UsageDetail[]` 聚合请求数、成功/失败、token breakdown、cost、`cost_status` 和 `missing_price_models`；补充或人工构造含 input/output/cached 但缺失 total 的明细，确认 total 不重复计入 cached tokens；补充或人工构造同一凭证混合已配置价格模型和未配置价格模型的明细，确认状态为 `partial` 且缺失模型被记录；service 对非十六进制 `auth_index` 做 URL encode 或按后端最终 query 契约传参。
- 停止条件: 如果后端字段命名与 spec 不一致，停止并先更新前后端契约。
- 接口 / 契约: `usageApi.getAuthUsageRequests()` 使用 `/usage/auths/:auth_index/requests`，路径中的 `auth_index` 必须编码，查询参数包含 `limit`、`offset`、`model`、`failed`、`from`、`to`；若后端最终改为 query 参数方案，service 层同步更新并保持组件调用不变；`credentialUsage.ts` 需要提供后端一致的 `normalizeCredentialTokenStats()` 或等价 helper，并提供 `summarizeCredentialCostCoverage()` 或等价 helper 输出 `complete | partial | unconfigured` 与缺失价格模型列表。

### 任务 2：扩展凭证统计表格

- 目标: 在 `CredentialStatsCard` 中展示 token breakdown 和估算金额，并保留现有请求数/成功率能力。
- 文件:
  - 新建: None
  - 修改: `src/components/usage/CredentialStatsCard.tsx`; `src/pages/UsagePage.tsx`; `src/pages/UsagePage.module.scss`
  - 读取: `src/utils/sourceResolver.ts`
  - 测试: `bun run type-check`
- 依赖: 任务 1
- 验证: 使用 mock usage 数据人工检查表格列；价格覆盖完整时显示 `formatUsd(cost)`；全部无价格时显示未配置状态；混合已配置/未配置价格时显示已覆盖部分估算值和“部分价格未配置”提示；移动端表格横向滚动不重叠。
- 停止条件: 如果新增列导致现有 details grid 布局不可用，停止并先给出布局调整方案。

### 任务 3：新增单凭证明细弹窗

- 目标: 点击凭证行或详情按钮后打开弹窗，展示该凭证调用明细和分页/降级状态。
- 文件:
  - 新建: `src/components/usage/CredentialUsageDetailsModal.tsx`
  - 修改: `src/components/usage/CredentialStatsCard.tsx`; `src/components/usage/index.ts`; `src/pages/UsagePage.module.scss`
  - 读取: `src/components/ui/Modal.tsx`; `src/components/usage/RequestEventsDetailsCard.tsx`
  - 测试: `bun run type-check`
- 依赖: 任务 1, 任务 2
- 验证: 点击单个凭证只显示该凭证明细；后端接口失败时降级为本地 usage filtering；弹窗 empty/loading/error 状态可见。
- 停止条件: 如果需要复制大量 `RequestEventsDetailsCard` 私有逻辑，先抽公共行构造工具，避免展示规则分叉。
- 接口 / 契约: 弹窗默认 `limit=50`，翻页使用 `offset`；本地降级最多渲染 500 条。

### 任务 4：补齐 i18n 与可访问性

- 目标: 新增凭证 token、估算金额、详情弹窗、分页、错误、未配置价格和部分价格未配置文案，并保证行操作可键盘触达。
- 文件:
  - 新建: None
  - 修改: `src/i18n/locales/zh-CN.json`; `src/i18n/locales/zh-TW.json`; `src/i18n/locales/en.json`; `src/i18n/locales/ru.json`; `src/components/usage/CredentialStatsCard.tsx`; `src/components/usage/CredentialUsageDetailsModal.tsx`
  - 读取: None
  - 测试: `bun run type-check`
- 依赖: 任务 2, 任务 3
- 验证: 四套语言 JSON 可解析；价格覆盖完整、部分缺失、全部未配置三种状态均有明确文案；按钮有明确 aria label；键盘可以打开和关闭弹窗。
- 停止条件: 如果翻译需要产品确认，先使用准确直译并记录待人工润色。

### 任务 5：前端验证与回归检查

- 目标: 完成类型检查、构建和人工交互验证。
- 文件:
  - 新建: None
  - 修改: None
  - 读取: None
  - 测试: `bun run type-check`; `bun run build`
- 依赖: 任务 1, 任务 2, 任务 3, 任务 4
- 验证: 命令通过；`git diff --check` 无空白错误；凭证统计和请求事件明细仍能正常渲染；混合价格覆盖用例不会把低估金额展示为完整金额。
- 停止条件: 如果构建失败来自已有未提交改动，记录证据并只修复本任务引入的问题。

## 执行交接

- 执行路由: direct_inline
- 为什么使用该路由: 任务可以按后端契约顺序推进，前端变更集中且可通过类型检查和构建收敛。
- 升级到: multi_agent
- 交接说明: 若后端尚未完成，可先实现本地聚合和弹窗降级路径；后端接口完成后再切换为 API 优先。

## 备注

- 前端金额沿用现有模型价格表，展示为估算金额。
- 本任务不迁移价格配置到后端；共享价格配置需要另起设计。
- 金额展示必须带价格覆盖状态；`partial` 只能表示“已覆盖部分的估算金额”，不能作为完整账单或完整估算金额展示。
