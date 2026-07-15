# 前端 Usage Token 与金额明细展示升级实施计划

- 目标: 在使用统计模块统一 token/cost normalization，新增缓存用量、缓存比、输入/输出/缓存金额明细、默认价格表和 unknown usage 展示语义，同时保持原有统计项。
- 输入模式: approved-spec
- 需求来源: spec:.agents/tasks/20260709-frontend-usage-token-cost-detail-v2/specs/2026-07-09-frontend-usage-token-cost-detail-v2-design.md
- Canonical Spec 路径: `.agents/tasks/20260709-frontend-usage-token-cost-detail-v2/specs/2026-07-09-frontend-usage-token-cost-detail-v2-design.md`
- 范围边界: usage 类型/API、normalization、价格表、凭证统计、单凭证明细、请求事件详情、趋势图/sparkline、导出、i18n、验证；不改额度展示，不迁移后端价格，不安装插件。
- 非目标: 不展示 prompt/response/原始密钥；不把估算金额称为真实账单；不删除原有统计面板；不要求后端价格表。
- 约束: 旧后端兼容；unknown/unconfigured 不画 0；reasoning/cache 不双算；价格使用 `provider:model` exact `PriceKey`，legacy model-only 只作为用户迁移 fallback；缺失价格组件不得隐式归零，只有显式 0 才是 known zero；四语言同步；布局不得重叠。
- 细化层级: contract-first
- 执行路由: multi_agent
- 为什么使用该路由: 主会话统筹前后端，前端实现可由 bounded implementer 按计划推进，完成后交由独立 reviewer 多轮评审；前端内部同一工作树只允许一个主写者。
- 升级触发条件: 如果需要重构整个 usage 页面、改后端 API 契约、或引入价格配置后端持久化，暂停并回到设计确认。

## 文件结构

- 新建:
  - `src/utils/usage/pricingDefaults.ts`
  - `src/utils/usage/normalization.ts` 或等价模块
  - `src/utils/usage/cost.ts` 或等价模块
  - `src/utils/usage/normalization.test.ts`
  - `src/utils/usage/cost.test.ts`
- 修改:
  - `package.json`
  - `src/services/api/usage.ts`
  - `src/stores/useUsageStatsStore.ts`
  - `src/utils/usage.ts`
  - `src/components/usage/credentialUsage.ts`
  - `src/components/usage/hooks/useUsageData.ts`
  - `src/components/usage/CredentialStatsCard.tsx`
  - `src/components/usage/CredentialUsageDetailsModal.tsx`
  - `src/components/usage/RequestEventsDetailsCard.tsx`
  - `src/components/usage/hooks/useSparklines.ts`
  - `src/components/usage/hooks/useChartData.ts`
  - `src/components/usage/CostTrendChart.tsx`
  - `src/components/usage/UsageChart.tsx`
  - `src/components/usage/PriceSettingsCard.tsx`
  - `src/pages/UsagePage.tsx`
  - `src/pages/UsagePage.module.scss`
  - `src/i18n/locales/zh-CN.json`
  - `src/i18n/locales/zh-TW.json`
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/ru.json`
- 读取:
  - `package.json`
  - `src/types/usage.ts`
  - `src/components/usage/StatCards.tsx`
  - `src/components/usage/TokenBreakdownChart.tsx`
  - `src/components/usage/UsageChart.tsx`
  - `src/components/usage/hooks/useChartData.ts`
- 测试:
  - `bun run test:usage`
  - `bun run type-check`
  - `bun run build`
  - `git diff --check`
  - `bun run lint` 如当前仓库要求且可运行

## 任务拆分

### 任务 1：建立 NormalizedUsageDetail 与 cost status 契约

- 目标: 新增统一 normalization / cost 类型，使 store、组件、导出和图表共享同一 token/cost facts。
- 文件:
  - 新建: `src/utils/usage/normalization.ts` 或等价模块; `src/utils/usage/cost.ts` 或等价模块; `src/utils/usage/normalization.test.ts`; `src/utils/usage/cost.test.ts`
  - 修改: `package.json`; `src/services/api/usage.ts`; `src/utils/usage.ts`; `src/stores/useUsageStatsStore.ts`
  - 读取: `src/types/usage.ts`
  - 测试: `bun run test:usage`; `bun run type-check`
- 依赖: 后端 v2 detail 契约已在本任务 spec 固定；实现需兼容旧后端。
- 验证: fixture 覆盖新 detail、旧 detail、缺 tokens、reported/computed total、cache read/creation、reasoning included/separate、价格组件缺失；断言 unknown usage 不转换成 0，total 不双算，缺失价格组件进入 `missingPriceComponents` 并让状态为 `partial` 或 `unconfigured`。
- 停止条件: 如果组件仍必须直接读取原始 backend detail 才能展示关键字段，停止并先调整 normalization 输出。
- 接口 / 契约: `CredentialCostStatus` 扩展为 `unknown_usage | unconfigured | partial | complete`。

### 任务 2：引入官方默认价格表与价格设置迁移

- 目标: 内置 `provider:model` exact 默认价格，迁移旧 prompt/completion/cache 命名到 input/output/cache，并保留用户 override。
- 文件:
  - 新建: `src/utils/usage/pricingDefaults.ts`
  - 修改: `src/utils/usage.ts` 或 `src/utils/usage/cost.ts`; `src/components/usage/hooks/useUsageData.ts`; `src/components/usage/PriceSettingsCard.tsx`; i18n 四语言文件; `src/utils/usage/cost.test.ts`
  - 读取: `src/components/usage/PriceSettingsCard.tsx`; `src/components/usage/hooks/useUsageData.ts`
  - 测试: `bun run test:usage`; `bun run type-check`
- 依赖: 任务 1
- 验证: 没有用户价格时按 exact official defaults 计算；用户 override 优先；旧 localStorage key 迁移为 legacy user override；UI 文案显示输入/输出/缓存，不再显示“提示/补全”；恢复默认只删除 override，不删除 official default；delete override 不影响 defaults；有 model 价格但缺 cache read/write 或 separate reasoning 必要组件时不按 0 计算为 complete。
- 停止条件: 如果无法确认某 provider_model 官方价格，先不填该 model default，不能用猜测价格。
- 接口 / 契约: 新增 `buildPriceKey(provider, model)`，provider 存在时返回 `${provider}:${model}`；provider 缺失时返回 `legacy:${model}`。`officialDefaults` 只使用 exact key；`userOverrides` 可使用 exact key 或 legacy key。`useUsageData.ts` 负责加载 resolved prices 与保存 user overrides；`PriceSettingsCard` 展示来源 badge，并支持 official default / user override / restore default / delete override。默认价格表含 `defaultsVersion`；不从后端拉默认价格。成本结果需要同时记录 `missingPriceModels` 与 `missingPriceComponents`，组件缺失不能由旧价格迁移默认成 0。

### 任务 3：升级凭证统计与单凭证明细

- 目标: 在凭证统计和单凭证明细弹窗展示 token breakdown、缓存比和 cost breakdown。
- 文件:
  - 新建: None
  - 修改: `src/components/usage/credentialUsage.ts`; `src/components/usage/CredentialStatsCard.tsx`; `src/components/usage/CredentialUsageDetailsModal.tsx`; `src/pages/UsagePage.module.scss`; i18n 四语言文件
  - 读取: `src/utils/sourceResolver.ts`
  - 测试: `bun run test:usage`; `bun run type-check`
- 依赖: 任务 1, 任务 2
- 验证: 凭证表保持请求数/成功率；新增输入/输出/缓存/总 token、缓存比、输入/输出/缓存/总金额；弹窗只显示当前凭证，unknown/unconfigured 显示 `--` 或提示，不显示 0。
- 停止条件: 如果表格列宽导致移动端重叠，先收敛布局方案。

### 任务 4：统一请求事件、导出、趋势图和 sparkline 语义

- 目标: 让请求事件详情、CSV/JSON 导出、cost trend 和 sparkline 消费 normalized facts，不再用 token series 冒充 cost。
- 文件:
  - 新建: None
  - 修改: `src/components/usage/RequestEventsDetailsCard.tsx`; `src/components/usage/hooks/useSparklines.ts`; `src/components/usage/hooks/useChartData.ts`; `src/components/usage/CostTrendChart.tsx`; `src/components/usage/UsageChart.tsx`; `src/components/usage/StatCards.tsx`; `src/utils/usage.ts`
  - 读取: `src/components/usage/TokenBreakdownChart.tsx`; `src/components/usage/UsageChart.tsx`; `src/components/usage/hooks/useChartData.ts`
  - 测试: `bun run test:usage`; `bun run type-check`
- 依赖: 任务 1, 任务 2
- 验证: 导出字段包含 token/cost breakdown；unknown usage 导出空值而不是 0；cost chart 对 unknown/unconfigured 产生 gap 或提示；已有 total requests/tokens 统计不回退。
- 停止条件: 如果需要大幅重写图表组件，先拆子任务并复审。

### 任务 5：补齐 i18n、可访问性和人工交互检查

- 目标: 补齐四语言文案、tooltip、aria label、键盘操作和布局细节。
- 文件:
  - 新建: None
  - 修改: `src/i18n/locales/zh-CN.json`; `src/i18n/locales/zh-TW.json`; `src/i18n/locales/en.json`; `src/i18n/locales/ru.json`; `src/components/usage/*.tsx`; `src/pages/UsagePage.module.scss`
  - 读取: None
  - 测试: `bun run type-check`; `bun run build`
- 依赖: 任务 3, 任务 4
- 验证: 四语言 JSON 可解析；按钮和图标有 aria label；键盘可打开/关闭明细弹窗；长模型名/凭证名不挤压金额列。
- 停止条件: 如果翻译存在业务含义争议，先用准确直译并记录待人工润色。

### 任务 6：前端最终验证与治理记录

- 目标: 运行验证命令，记录证据并准备代码独立评审。
- 文件:
  - 新建: None
  - 修改: `.agents/tasks/20260709-frontend-usage-token-cost-detail-v2/progress.md`; `.agents/tasks/20260709-frontend-usage-token-cost-detail-v2/findings.md`
  - 读取: `package.json`
  - 测试: `bun run test:usage`; `bun run type-check`; `bun run build`; `git diff --check`
- 依赖: 任务 1, 任务 2, 任务 3, 任务 4, 任务 5
- 验证: 命令通过；本任务必须新增并运行 `test:usage`，不得把未运行测试伪装成通过；准备独立代码评审 packet。
- 停止条件: 如果 build/type-check 失败且源于历史问题，记录证据并只修本任务引入的问题。

## 执行交接

- 执行路由: multi_agent
- 为什么使用该路由: 主会话统筹前后端；前端实现由一个 bounded implementer 按计划顺序推进，避免同一 UI/utility 文件被多写者并发修改；完成后进入 independent review 修复循环。
- 升级到: plan-driven-serial
- 交接说明: 前端实现必须先完成 normalization，再改 UI；不得让组件继续各自解析 raw usage。若后端 v2 字段尚未实现，先保留旧后端兼容路径并用 fixture 验证。

## 备注

- 本计划是 `20260703-frontend-auth-usage-token-cost-statistics` 的后续增强，不修改其发布历史。
- 默认价格表只维护可确认的官方价格；不能确认的 model 保持 unconfigured。
- unknown usage 与 unconfigured 是不同状态：前者是没有可用 usage facts，后者是有 usage 但无价格。
