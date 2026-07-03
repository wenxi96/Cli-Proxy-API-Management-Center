# 认证文件额度展示统一化 实施计划

## 计划头部

- Task ID: `20260629-auth-file-quota-display-unification`
- Input Mode: `clear-requirements`
- Canonical Spec 路径: None
- 需求来源: 用户会话诉求 —— 认证文件在「单文件刷新额度」与「批量检查概览卡片」两处入口展示信息不一致，要求统一为同一套渲染（A 对齐 B）。
- 期望结果: 同一个认证文件，无论从「单文件刷新」还是「批量检查」入口查看，其额度展示的通用部分（百分比精度、数量 amount、重置时间 reset、行标签、进度条）完全一致；provider 特有信息（codex reset credits 列表、antigravity group→bucket 嵌套、claude extra_usage、xai pay-as-you-go）作为对应 provider 卡片的扩展保留，不在两入口间强求一致。
- 范围边界:
  - 做：渲染层统一。抽取批量侧（B）的行渲染逻辑为可复用视图组件；为单文件侧（A）的 5 个 provider 各写一个 adapter，把各自 state 转成与 B 相同的行结构；A 通用部分改用统一视图，特有信息作为 extras 单独渲染。
  - 不做：不改动 `fetchQuota` / `resetQuota` / 数据获取层；不改动 store；不改动 `QuotaProgressBar` 阈值；不改动后端批量检查接口契约；不改动 `AuthFileCard` 的互斥显示逻辑（`!batchCheckResult`）；不处理 `QuotaPage` 的 `QuotaCard` 路径（那是独立的 QuotaPage，非本次入口）。
- 验证路径:
  - `bun run type-check` exit 0
  - `bun run lint` exit 0
  - `bun run build` exit 0
  - 人工：用真实 codex/claude/antigravity/kimi/xai 认证文件分别触发「单文件刷新」和「批量检查」，对比同一账号两入口的百分比精度、amount、reset、行标签是否一致；provider 特有信息是否仍在对应卡片展示。
- 已知约束:
  - `CUSTOM_MARK=wx` / fork 定制 5 项（DisplayName、Auth Files Batch Check、Scoped Poll、ZIP 下载、tag-only release）不得丢失，本任务不触碰这些。
  - 百分比精度统一采用批量侧（B）的小数算法（`formatPercentValue`，≥10 取 1 位小数，<10 取 2 位小数，整数无小数）。
  - provider 特有信息保留（用户明确拍板「都保留」）。
  - antigravity 嵌套结构保留（作为该 provider 特有信息，不扁平化）。
- 开放设计歧义: none
- Detail Level: `contract-first`
- 执行路由: `direct_inline`
- 为什么使用该路由: 范围集中在渲染层、单仓库单分支、文件数有限（新增 1-2 个组件 + 改 2 个现有文件 + 5 个 adapter）、无跨 agent 并发写需求、无长任务特征；适合单 agent 顺序执行。
- 升级触发条件:
  - 若实现中发现 adapter 需要改动数据获取层或 store，触发范围回归，回到主线程重新确认。
  - 若统一后某 provider 特有信息无法作为 extras/plan.items 表达，需重新评估结构，回到主线程。
  - 若 A 路径切换 `QuotaRowsView` 后 DOM/className 结构与原 `renderXxxItems` 输出不等价导致非预期视觉回归（超出百分比小数化），暂停并上报。

## 文件结构

### Create（新建）

- `src/features/authFiles/components/QuotaRowsView.tsx` — 统一的额度行视图组件。接受 `NormalizedQuotaView`，输出 plan 区 + rows（含可选嵌套）+ extras 区。从 `AuthFileBatchQuotaSection` 抽取 `buildBatchQuotaRows` 的渲染部分（不含数据收集），并用 JSX 重写（对齐 B 的渲染）。
- `src/features/authFiles/utils/quotaView.tsx` — 归一化视图模型与 adapter。定义 `NormalizedQuotaView`、`NormalizedQuotaRow` 类型；导出 `batchResultToQuotaView`（B 路径 adapter，复用现有 `buildBatchQuotaRows` 逻辑）和 `providerStateToQuotaView`（A 路径入口，内部按 providerType 分派到 5 个子 adapter）。

### Modify（修改）

- `src/features/authFiles/components/AuthFileBatchQuotaSection.tsx` — 改为调用 `QuotaRowsView` 渲染，删除内部重复的行渲染 JSX；保留 plan 区与 credit_balance 处理（或移交 `QuotaRowsView` 的 plan 区）。其数据收集函数（`collectBatchQuotaWindows` 等）迁入 `quotaView.tsx` 并由 `batchResultToQuotaView` 复用。
- `src/features/authFiles/components/AuthFileQuotaSection.tsx` — 将 success 状态下 `config.renderQuotaItems(quota, t, helpers)` 调用替换为：`providerStateToQuotaView(quotaType, quota, t)` + `<QuotaRowsView>`。loading/idle/error 状态分支保持不变。**不改动** `quotaConfigs.ts` 的 `renderQuotaItems` 字段与 5 个 `renderXxxItems` 函数（QuotaPage 路径仍依赖）。

### Read（读取，不改）

- `src/features/authFiles/components/AuthFileCard.tsx` — 确认互斥显示逻辑（`:138` `!batchCheckResult`）不受影响。
- `src/components/quota/quotaConfigs.ts` — 参照各 `renderXxxItems` 与 state 类型实现 adapter。**约束修订（T3 drift 决策，2026-06-30）**：原"不改此文件"修订为"不改其渲染逻辑（5 个 `renderXxxItems` / `renderQuotaItems` 字段 / QuotaPage 路径零影响），允许给 adapter 需要的私有辅助函数/常量加 `export`"。实际已 export 的 10 个（= quotaView.tsx import 数，零超额）：`formatAntigravityResetLabel`/`ANTIGRAVITY_GROUP_LABEL_KEYS`/`ANTIGRAVITY_BUCKET_LABEL_KEYS`/`translateAntigravityQuotaLabel`/`translateAntigravityQuotaDescription`/`getAntigravityPlanLabel`/`PREMIUM_CODEX_PLAN_TYPES`/`formatUsdFromCents`/`formatXaiRemainingAmount`/`resolveXaiPlan`。注：`formatAntigravityDuration`/`normalizeAntigravityQuotaText`/`XAI_SUPERGROK_LIMIT_CENTS`/`HEAVY` 这 4 个保持私有（同文件内被上述函数内部调用，无需 export）。
- `src/components/quota/QuotaCard.tsx` / `src/components/quota/QuotaSection.tsx` — QuotaPage 路径，仅读取确认接口，**不改**。
- `src/types/authFile.ts` — `AuthFileBatchCheckWindow` / `AuthFileBatchCheckDetails` 作为 B 路径数据源，不改。
- `src/pages/AuthFilesPage.module.scss` / `src/pages/QuotaPage.module.scss` — 确认 `quotaRow`/`quotaModel`/`quotaMeta`/`quotaPercent`/`quotaAmount`/`quotaReset`/`codexPlan`/`premiumPlanValue`/`antigravityQuotaGroup*` 等样式类存在（已确认 `AuthFilesPage.module.scss` 含全部所需类）；本任务不新增样式类，复用现有。

### Test（测试入口）

- `bun run type-check`、`bun run lint`、`bun run build` 为强制验证。
- 不新增单元测试文件（仓库当前无前端组件测试框架配置，遵循现有模式）；以人工双入口对比作为行为验证。

## 任务拆分

### T1: 定义归一化视图模型与批量侧 adapter

- 目标: 在 `src/features/authFiles/utils/quotaView.tsx` 中定义 `NormalizedQuotaView` / `NormalizedQuotaRow` 类型，并把 `AuthFileBatchQuotaSection` 现有的数据收集与行构建逻辑（`collectBatchQuotaWindows`、`resolveWindowPercent`、`resolveWindowLabel`、`resolveAmountLabel`、`resolveResetLabel`、`buildBatchQuotaRows`、`formatPercentValue` 等）迁入，导出 `batchResultToQuotaView(result, t): NormalizedQuotaView`。B 路径行为保持不变。
- 文件:
  - `src/features/authFiles/utils/quotaView.tsx`（新建）
  - `src/features/authFiles/components/AuthFileBatchQuotaSection.tsx`（修改：临时改为从 `quotaView.tsx` 导入上述函数，保持原渲染，本任务不删渲染）
- 依赖: None
- 验证: `bun run type-check` exit 0；`bun run build` exit 0；批量检查概览卡片视觉与迁移前完全一致（人工对比）。
- 停止条件: 若迁移过程中发现 `AuthFileBatchQuotaSection` 还依赖了未列出的辅助函数或样式，暂停并补全文件清单后再继续。
- 接口 / 契约:
  - `NormalizedQuotaRow` 采用 **discriminated union**（避免 leaf 行的 `percent/percentLabel` 必填约束 group 行塞 dummy 值）：
    - `NormalizedQuotaLeafRow`: `{ kind: 'leaf'; key: string; label: string; percent: number | null; percentLabel: string; amountLabel?: string; resetLabel?: string; title?: string }`。
    - `NormalizedQuotaGroupRow`: `{ kind: 'group'; key: string; label: string; description?: string; nested: NormalizedQuotaLeafRow[] }`。
    - 统一类型 `NormalizedQuotaRow = NormalizedQuotaLeafRow | NormalizedQuotaGroupRow`。
    - 字段职责：`title` = tooltip（B 路径既有语义，antigravity bucket description 用此）；`description` = 可见副标题（**仅 group 行**，antigravity group description 用此，避免与 tooltip 语义冲突导致可见 span 降级为 hover）；`nested` 供 antigravity group→bucket 嵌套（一层足够，daily/weekly 是独立 bucket 条目非单 bucket 多 limit）。**group 行不含 `percent/percentLabel/amountLabel/resetLabel/title`**，从类型层面杜绝「group header 被迫渲染 null→0 宽度进度条」的回归。
  - `NormalizedQuotaView`: `{ plan?: { items: { key: string; label: string; value: string; premium?: boolean }[] }; rows: NormalizedQuotaRow[]; extras?: ReactNode; empty?: string }`。新增 `empty?: string` 字段承载 provider 特有空态文案（见 F2 说明）。
  - `batchResultToQuotaView` 输出与现有 `buildBatchQuotaRows` + plan/credit_balance 处理等价；空态 `empty` 设为 B 路径的 `t('common.not_set')`。

### T2: 实现统一渲染组件 QuotaRowsView

- 目标: 新建 `src/features/authFiles/components/QuotaRowsView.tsx`，用 JSX 实现统一渲染：plan 区（items 循环，支持 premium 样式）+ rows 循环 + extras 区（直接渲染 ReactNode）+ 空态处理。rows 渲染按 `row.kind` 分派（**对应 T1 的 discriminated union**）：若 `row.kind === 'group'`，只渲染 group header 块（`antigravityQuotaGroupTitle` span 渲染 `label` + 可选 `antigravityQuotaGroupDescription` span 渲染 `description`），**不渲染** percent/percentLabel/amountLabel/resetLabel/`QuotaProgressBar`（group header 原本就无进度条与百分比，且 group 类型无这些字段，避免 `QuotaProgressBar` 在 null 时仍渲染 0 宽度进度条导致视觉回归），再循环 `row.nested`（`NormalizedQuotaLeafRow[]`）渲染子行；若 `row.kind === 'leaf'`，按普通行渲染 label/percent/amount/reset + `QuotaProgressBar`，**保留 B 路径既有 `title={row.title ?? row.label}` 行为**（避免无 model_ids 的批量行丢 tooltip）。空态：若 `view.rows.length === 0 && view.empty`，渲染 `<div className={quotaMessage}>{view.empty}</div>`。复用 `AuthFilesPage.module.scss` 的现有样式类（`antigravityQuotaGroup`/`antigravityQuotaGroupHeader`/`antigravityQuotaGroupTitle`/`antigravityQuotaGroupDescription`/`quotaMessage` 已存在于 `AuthFilesPage.module.scss:516-545`，无需新增）。`AuthFileBatchQuotaSection` 改为调用 `batchResultToQuotaView` + `<QuotaRowsView>`，删除内部行渲染 JSX。
- 文件:
  - `src/features/authFiles/components/QuotaRowsView.tsx`（新建）
  - `src/features/authFiles/components/AuthFileBatchQuotaSection.tsx`（修改：渲染改为 `<QuotaRowsView view={batchResultToQuotaView(result, t)} />`）
- 依赖: T1
- 验证: `bun run type-check` exit 0；`bun run build` exit 0；批量检查概览卡片视觉与 T1 后完全一致（B 路径自验通过）。
- 停止条件: 若 `QuotaRowsView` 需要的样式类在 `AuthFilesPage.module.scss` 不存在且无法用现有类组合表达，暂停上报，不擅自新增样式类。
- 接口 / 契约: `QuotaRowsViewProps: { view: NormalizedQuotaView }`。
- 不变量: B 路径（`batchResultToQuotaView`）产出的 rows 永远扁平，无 `nested`（`collectBatchQuotaWindows` 把 windows/buckets/rows/groups 全部扁平化为单一 `AuthFileBatchCheckWindow[]`，`BatchQuotaRow` 无 nested 字段）；`QuotaRowsView` 的 nested 渲染分支只由 A 路径 antigravity 触发。此为可验证不变量，T2/T5 据此确认 B 路径视觉不变。

### T3: 实现 A 路径 5 个 provider adapter

- 目标: 在 `quotaView.tsx` 内实现 `providerStateToQuotaView(quotaType, quota, t): NormalizedQuotaView`，内部按 `quotaType` 分派到 5 个子 adapter：`codexStateToQuotaView`、`claudeStateToQuotaView`、`antigravityStateToQuotaView`、`kimiStateToQuotaView`、`xaiStateToQuotaView`。每个子 adapter 把对应 provider state 的通用字段（百分比、amount、reset、label）映射到 `NormalizedQuotaRow`，**百分比统一用 `formatPercentValue`（小数算法，对齐 B）**；provider 特有信息映射到 `NormalizedQuotaView.plan.items`（plan/expiry/reset_credits 可用数/extra_usage/pay-as-you-go）或 `extras`（codex reset credits 过期列表、antigravity group→bucket 嵌套）。特有信息的展示文案与现有 `renderXxxItems` 等价。
- 文件:
  - `src/features/authFiles/utils/quotaView.tsx`（修改：新增 5 个子 adapter 与分派函数）
  - 读取 `src/components/quota/quotaConfigs.ts`（参照各 `renderXxxItems` 与 state 类型，确保字段映射不丢）
- 依赖: T1
- 验证: `bun run type-check` exit 0。每个 adapter 单独人工核对：输入典型 state，输出 `NormalizedQuotaView` 的 rows/plan/extras 字段与原 `renderXxxItems` 产出的字段集合等价（百分比精度改为小数属预期差异）。
- 停止条件: 若某 provider 的特有信息（如 codex reset credits 过期列表）无法用 `extras: ReactNode` 表达且需要特殊结构，暂停并回到主线程评估是否扩展 `NormalizedQuotaView`。
- 接口 / 契约:
  - `providerStateToQuotaView(quotaType: QuotaProviderType, quota: unknown, t: TFunction): NormalizedQuotaView`
  - 5 个子 adapter 签名: `(state: TState, t: TFunction) => NormalizedQuotaView`，state 类型从 `quotaConfigs.ts` 对应 QuotaState 复用。
- 步骤:
  1. codex: windows→rows（percent 用小数，无 amountLabel）；plan.items = [plan_type(含 **pro 及 pro-lite 变体** premium)、expires、reset_credits 可用数]；reset credits 过期列表结构化为 `NormalizedQuotaResetCredits`（`{ title, items: [{key,label,time}], error? }`），由 QuotaRowsView 用 CSS Modules 渲染（**不**用自由 JSX extras，避免字符串 className 冲突）；**空态**：windows 为空时 `empty = t('codex_quota.empty_windows')`（`quotaConfigs.ts:1006-1008`）。premium 判定：直接 import 已 export 的 `PREMIUM_CODEX_PLAN_TYPES`（`quotaConfigs.ts:890`，含 `pro/prolite/pro-lite/pro_lite`）；`normalizePlanType` 从 `src/utils/quota/parsers.ts`（`:51`，公共 util）import；`isPremiumPlan = PREMIUM_CODEX_PLAN_TYPES.has(normalizePlanType(planType))`——**`pro` 也算 premium，不得只判 pro-lite**。
  2. claude: windows→rows；plan.items = [plan_type、extra_usage（仅 `$used/$limit` 字符串，**不含百分比**——`renderClaudeItems:1207-1217` 实际未渲染 utilization）]；**空态**：windows 为空时 `empty = t('claude_quota.empty_windows')`（`quotaConfigs.ts:1219-1221`）。**容器差异（预期）**：源码中 plan_type 与 extra_usage 是两个相邻的独立 `codexPlan` div（`quotaConfigs.ts:1196-1204` key='plan'、`:1207-1217` key='extra'），统一后并入同一 `plan.items` 数组，由 `QuotaRowsView` 渲染为单 plan 容器内两 item——属预期视觉近似（同 className 等价），非回归，T5 不可据此判定失败。
  3. antigravity: groups→顶层 rows，每个 group 一个 `kind: 'group'` 顶层 row（**仅设** `label`=group label、`description`=group.description（`quotaConfigs.ts:841-843` 可见 span，映射到 `description` 字段，**不可塞进 title tooltip**）；group 类型不含 percent/percentLabel/amountLabel/resetLabel——group header 原本无进度条与百分比，`"Available"`/`quota_available` 文案是 bucket 级的，不可上移到 group）；buckets→`nested`（每个 bucket 一个 `kind: 'leaf'` 子行，`label`=bucket label、`title`=bucket.description（tooltip 语义，对齐 B 路径）、percent/percentLabel/resetLabel 同原逻辑，满额时 percentLabel 取 `"Available"`）；plan.items = [plan_label]，premium 标记保留（ultra/ultra-lite）；**空态**：groups 为空时 `empty = t('antigravity_quota.empty_models')`（`quotaConfigs.ts:812-820`）。
  4. kimi: rows→rows（`kind: 'leaf'`，amount 用 `${used} / ${limit}`，percent 用小数）；**空态**：rows 为空时 `empty = t('kimi_quota.empty_data')`（`quotaConfigs.ts:1401-1402`）。
  5. xai: 单行 monthly credits→rows（`kind: 'leaf'`，amount 用 `${remaining} / ${limit}` USD，percent 用小数）；plan.items = [plan(含 supergrok heavy premium)、pay-as-you-go]。**pay-as-you-go value 必须是完整本地化标签**：`onDemandCapCents > 0` 时取 `t('xai_quota.pay_as_you_go_enabled', { cap: formatUsdFromCents(onDemandCap) })`，否则 `t('xai_quota.pay_as_you_go_disabled')`（复刻 `quotaConfigs.ts:1569-1574`）——不可只塞 `formatUsdFromCents(onDemandCap)` 数值，否则丢失「Enabled/Disabled」语义与 `onDemandCap===0` 分支。**空态**：无 billing 时 `empty = t('xai_quota.empty_data')`（`quotaConfigs.ts:1559-1560`）。

### T4: A 路径接入统一视图（保留 QuotaPage 的 renderQuotaItems）

- 目标: 修改 `AuthFileQuotaSection.tsx`，把 success 状态下的 `config.renderQuotaItems(quota, t, helpers)` 替换为 `providerStateToQuotaView(quotaType, quota, t)` + `<QuotaRowsView>`。loading/idle/error 分支不变。**保留** `quotaConfigs.ts` 中 5 个 `renderXxxItems` 函数与 `QuotaConfig.renderQuotaItems` 字段、`QuotaCard.tsx` 接口不变（QuotaPage 路径 `QuotaSection.tsx:382` 仍在使用它们）；本任务只让 A 路径不再走 `renderQuotaItems`。
- 文件:
  - `src/features/authFiles/components/AuthFileQuotaSection.tsx`（修改：success 分支改用统一视图）
- 依赖: T2, T3
- 验证: `bun run type-check` exit 0；`bun run lint` exit 0；`bun run build` exit 0。A 路径单文件刷新：5 个 provider 各刷新一次，确认通用字段与批量侧一致、特有信息仍在。QuotaPage（`/quota` 页）刷新仍正常（未改其渲染路径）。**A 路径视觉回归对照**：对每个 provider，对照切换 `QuotaRowsView` 前后的行层级、plan 区容器、antigravity 嵌套缩进、进度条颜色档位，除已预期的百分比小数化外应一致。
- 停止条件: 若 A 路径改用统一视图后，`quotaConfigs.ts` 的 `renderXxxItems` 在 A 路径变为死代码但仍被 QuotaPage 使用，保持现状不删；不重写 QuotaPage 渲染。
- 交接说明: `renderXxxItems` 5 函数 + `QuotaConfig.renderQuotaItems` 字段 + `QuotaRenderHelpers` 类型（`QuotaCard.tsx:55`）+ `QuotaCard.renderQuotaItems` prop 必须整体保留，它们是 QuotaPage（`/quota`，`QuotaSection.tsx:382`→`QuotaCard.tsx:152`）路径的活跃依赖；对 A 路径而言切换后不再可达，属预期死代码，勿删。若后续要统一 QuotaPage，可作为新任务。

### T5: 双入口行为一致性验证

- 目标: 在 dev 上用真实认证文件验证「单文件刷新」与「批量检查概览」两入口对同一账号的展示一致性。覆盖 codex、claude、antigravity、kimi、xai 五类（至少各一个可用账号）。
- 文件:
  - 读取 `src/features/authFiles/components/AuthFileQuotaSection.tsx`、`AuthFileBatchQuotaSection.tsx`（确认最终渲染路径）
- 依赖: T4
- 验证: 人工对比同一账号两入口：百分比精度一致（小数）、amount 一致（有则两处都有）、reset 格式一致、行标签一致、进度条一致；provider 特有信息仅在对应卡片出现。type-check/lint/build 全绿。**antigravity 专项核对**：group 的可见 description span 是否保留（非降级为 tooltip）；codex reset credits 过期列表是否完整；claude extra_usage 是否仅 `$used/$limit`（无百分比）。**验证缺口处理**：若环境缺少某 provider 可用账号，在 progress.md 记录未覆盖项与原因，不强行收口该 provider。
- 停止条件: 若任一 provider 两入口出现字段缺失或数值不一致且非预期差异，回到 T3/T4 修正，不收口。

## 执行交接

- 执行路由: `direct_inline`
- 执行顺序: T1 → T2 → T3 → T4 → T5（严格顺序，T3 可与 T2 并行但建议顺序以降低风险）
- 分支: 在 `dev` 上推进；不 push、不 tag、不 release，除非用户授权。
- 关键不变量: 不改数据获取层、store、后端契约、`QuotaProgressBar` 阈值、`AuthFileCard` 互斥显示逻辑。
- 风险点: A 路径从 `renderXxxItems`（createElement + styleMap）迁到 `QuotaRowsView`（JSX + `AuthFilesPage.module.scss`），DOM 层级与 className 组合可能产生细微视觉差异——T4/T5 已要求视觉回归对照。`QuotaCard.tsx`（QuotaPage 路径）对 `renderQuotaItems` 的耦合 —— T4 已规定保留不删，无连锁风险。

## 备注

- 本任务与 `20260626-frontend-upstream-v1-17-7`（上游 v1.17.7 吸收）无继承关系，是独立的展示层优化任务；代码基线为 `dev@d8b3dd4`（已含 v1.17.7）。
- 样式来源澄清（评审已核实）：`quotaConfigs.ts` 顶部 import 的是 `QuotaPage.module.scss`（`QuotaRenderHelpers.styles` 类型签名声明为 `typeof QuotaPage.module.scss`），但 A 路径 `AuthFileQuotaSection.tsx:212-215` 实际传入的 `helpers.styles` 是 `AuthFilesPage.module.scss`，`QuotaProgressBar` 也是 `authFiles/components/` 版本。因此 A 路径当前已用 `AuthFilesPage.module.scss` 体系渲染。两份 scss 的同名关键类（quotaRow/quotaModel/quotaMeta/quotaPercent/quotaAmount/quotaReset/codexPlan/premiumPlanValue/antigravityQuotaGroup* 等）样式声明完全一致，故改用 `QuotaRowsView`（也用 `AuthFilesPage.module.scss`）后视觉理论不变（仅百分比小数化为预期变化）。本任务不处理 QuotaPage 路径。
- 双 `QuotaProgressBar` 既有问题（`authFiles/components/` 用 `AuthFilesPage.module.scss`，`components/quota/QuotaCard.tsx` 内用 `QuotaPage.module.scss`）不在本任务范围；QuotaPage 路径的 `renderXxxItems` 保留不动。
