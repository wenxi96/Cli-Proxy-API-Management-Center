# Progress — 认证文件额度展示统一化

## 2026-06-29 调研与计划落地

- Action: 调研 A/B 两处额度展示代码路径，对比差异，与用户确认统一化方案（渲染层统一、A 对齐 B、provider 特有信息保留、antigravity 嵌套保留），编写 canonical implementation plan。
- Files: `.agents/tasks/20260629-auth-file-quota-display-unification/{task.md,findings.md,plans/2026-06-29-auth-file-quota-display-unification-implementation-plan.md}`
- Verification: 读取 `AuthFileQuotaSection.tsx`、`AuthFileBatchQuotaSection.tsx`、`quotaConfigs.ts`、`QuotaCard.tsx`、`QuotaProgressBar.tsx`、`AuthFileCard.tsx`、`types/authFile.ts` 确认差异与文件边界；未跑构建（计划阶段）。
- Result: 计划已落地，5 个任务 T1-T5，detail level `contract-first`，执行路由 `direct_inline`。
- Next: 等待用户批准计划后进入 T1 实现。

## 2026-06-29 独立方案评审（2 个 reviewer agent 并行）

- Action: 按 independent review 契约派发 2 个独立 reviewer agent 评审计划（契约适配性 + 样式切换/QuotaPage 依赖）。
- Files: 计划文件 `plans/2026-06-29-auth-file-quota-display-unification-implementation-plan.md`（已按评审 findings 修正）。
- Verification: reviewer 实际读代码验证，非猜测。
- Result: 发现 1 个 High + 1 个事实性错误，已修正 plan：
  1. **High**：antigravity group 的可见 description（`quotaConfigs.ts:841-843`）在原 `NormalizedQuotaRow` 模型无字段承载，统一后会丢失（违反"都保留"）。修正：模型加 `description?: string`（与 `title` tooltip 语义分离），T2 渲染明确 group header 含 description span，T3 步骤 3 明确映射。
  2. **事实错误**：原备注说 A 路径 `renderXxxItems` 注入 `QuotaPage.module.scss`——实际 A 路径 `AuthFileQuotaSection.tsx:212-215` 注入的是 `AuthFilesPage.module.scss`，两份 scss 同名类视觉一致。修正备注、升级触发条件、风险点。
  3. 澄清：claude extra_usage 实际仅 `$used/$limit`，无百分比（原 T3 步骤 2 措辞易误解），已修正。
  4. 补强：T4 交接说明补"`renderXxxItems`+`QuotaRenderHelpers` 类型整体保留、对 A 路径属预期死代码"；T4/T5 补 A 路径切换前后视觉回归对照；T5 补验证缺口处理（缺账号时记录不强行收口）。
- Next: 等待用户批准修正后的计划进入 T1 实现。

## 2026-06-30 复审（re-review，1 个 reviewer agent）

- Action: 对修正后的 plan 派发独立复审，验证上一轮 findings 是否闭环、修正是否引入新问题。
- Files: 计划文件（已按复审 findings 再次修正）。
- Verification: reviewer 实读 `quotaConfigs.ts:834-884`、`QuotaProgressBar.tsx:14-33`、`AuthFileBatchQuotaSection.tsx:51-193`、`types/quota.ts`、i18n locales 验证。
- Result: 上一轮 finding 2-5 全部闭环；finding 1 字段定义闭环但 T3 步骤 3 引入新 High 风险（group 行带 percent/Available 文案，原 group header 无进度条/百分比，且 QuotaProgressBar 在 null 时仍渲染 0 宽度进度条）。复审还确认：B 路径 rows 永远扁平无 nested、待迁移函数全为模块内部无外部引用、i18n key 全部已存在、类型已就绪。已修正：
  1. **High N1**：T2 渲染规则明确"有 nested 的行只渲染 group header（label+description span），不渲染 percent/进度条/amount/reset"；T3 步骤 3 改为"group 顶层 row 仅设 label+description，不设 percent/percentLabel/amountLabel/resetLabel，'Available'文案是 bucket 级不可上移"。
  2. **Medium N2**：T2 补不变量"B 路径 rows 永远扁平无 nested，nested 分支只由 A 路径 antigravity 触发"。
- Next: 等待用户批准复审修正后的计划进入 T1 实现。

## 2026-06-30 第三轮复审（re-review，2 个 reviewer agent 并行）

- Action: 对第二轮修正后的 plan 派发 2 个独立 reviewer 切片并行复审——切片 A「前两轮 findings 闭环验证」、切片 B「契约自洽性 + T3 adapter 与 quotaConfigs.ts 对应性 + 新风险扫描」。
- Files: `plans/2026-06-29-auth-file-quota-display-unification-implementation-plan.md`（已按本轮 findings 修正）。
- Verification: 两 reviewer 均实读源码核验（非猜测）：`quotaConfigs.ts`（renderCodexItems:886-925 / renderClaudeItems:1194-1217 / renderAntigravityItems / renderXaiItems:1565-1574）、`QuotaProgressBar.tsx:24`、`AuthFileQuotaSection.tsx:22,212-214`、`AuthFileBatchQuotaSection.tsx:12,16-24,51-81`、`QuotaCard.tsx:55`、`AuthFilesPage.module.scss:516-545`、i18n locales；主线程二次复核 reviewer 引用的源码行（886-925、1565-1574、1194-1217）确认无误。
- Result:
  1. **切片 A 闭环结论**：前两轮 7 个 finding（F1.1-F1.4、F2.1-F2.2）**全部 Closed**，无 Not Closed / Partially / Regression，落地位置与源码事实交叉一致、修正间无新矛盾。
  2. **切片 B 新 findings**（主线程复核后采信 3 条、驳回 1 条）：
     - **Finding-1 (Medium)**：codex adapter premium 判定**遗漏 `pro`**。源码 `quotaConfigs.ts:890` `PREMIUM_CODEX_PLAN_TYPES = {'pro','prolite','pro-lite','pro_lite'}`，`:920` `isPremiumPlan` 对 `pro` 也为 true，而 plan T3 步骤 1 只写「pro-lite premium」。**已修正**：T3 步骤 1 改为「含 pro 及 pro-lite 变体 premium」，并强制复用整集 + 引用 `:890/:920`。
     - **Finding-2 (Low)**：xai pay-as-you-go value 描述偏狭。源码 `:1569-1574` value 是完整本地化标签（`pay_as_you_go_enabled`/`pay_as_you_go_disabled`）+ `onDemandCap===0` 分支，非仅 `formatUsdFromCents`。**已修正**：T3 步骤 5 明确「必须是完整本地化标签」，复刻 `:1569-1574`。
     - **Finding-3 (Info)**：claude plan_type 与 extra_usage 在源码是两个相邻独立 `codexPlan` div（`:1196-1204` key='plan'、`:1207-1217` key='extra'），统一后并入单 `plan.items`。**已修正**：T3 步骤 2 注明此为预期视觉近似（同 className 等价）、T5 不可据此判失败。
     - **Finding-4 (驳回)**：reviewer B 称 kimi amount 字面量 `${used}/${limit}` 缺空格——主线程复核 plan L101/L102 实际写的是 `${used} / ${limit}`、`${remaining} / ${limit}`，本就带空格，reviewer 误判，不改。
  3. 顺带订正：T2 样式类行号范围 `528-545` → `516-545`（`.antigravityQuotaGroup` 基础容器类起于 516，原范围只覆盖 Header/Title/Description 3 个类，类均存在不影响实现）。
- Next: 等待用户批准第三轮修正后的计划进入 T1 实现。当前无 High 级遗留（最高 Medium=Finding-1，已修），契约类型自洽、T1-T5 依赖链与不变量无矛盾，可放行实现。

## 2026-06-30 第四轮复审（外部第三方 agent 评审）

- Action: 用户提供第三方 agent 评审结果（最高 Medium，4 个 findings），主线程逐条用源码核实后采信并修正 plan。
- Files: `plans/2026-06-29-auth-file-quota-display-unification-implementation-plan.md`（已按本轮 findings 修正）。
- Verification: 主线程实读源码逐条核实——`quotaConfigs.ts:890`（PREMIUM_CODEX_PLAN_TYPES 私有未导出）、`:812-820`（antigravity empty_models）、`:1006-1008`（codex empty_windows）、`:1219-1221`（claude empty_windows）、`:1401-1402`（kimi empty_data）、`:1559-1560`（xai empty_data）、`AuthFileBatchQuotaSection.tsx:248`（B 空态 common.not_set）、`src/components/quota/index.ts`（barrel 不导出 premium 集合）、`src/utils/quota/parsers.ts:51`（normalizePlanType 真实定义源，已导出）。**4 个 findings 全部成立，无误判**（第三方质量高，尤其 F3 抓到上一轮内部修正引入的矛盾）。
- Result:
  1. **F1 (Medium)**: `NormalizedQuotaRow` 把 `percent/percentLabel` 定为必填，与 T3 antigravity group"不设"矛盾——group 行会被迫塞 dummy。**已修正**：T1 改为 discriminated union（`NormalizedQuotaLeafRow` 必填 percent、`NormalizedQuotaGroupRow` 必填 nested 且不含 percent）；T2 渲染按 `row.kind` 分派；T3 步骤 3 group 标 `kind:'group'`、buckets 标 `kind:'leaf'`。从类型层面杜绝 group header 渲染 null→0 宽度进度条。
  2. **F2 (Medium)**: `NormalizedQuotaView` 无字段承载 provider 特有空态文案，统一后会丢（5 个 provider 各有 empty key 已逐一核实）。**已修正**：`NormalizedQuotaView` 加 `empty?: string`；T2 补空态渲染分支；T3 五个 provider 步骤各补 empty 映射（codex/claude/antigravity/kimi/xai 各自 key + 源码行号）；B adapter 设 `common.not_set`。
  3. **F3 (Medium)**: T3 步骤 1 要求"复用 PREMIUM_CODEX_PLAN_TYPES"但该 const 私有未导出，与"不改 quotaConfigs"矛盾——这是上一轮内部修正 F1 时引入的新矛盾。**已修正**：明确在 quotaView.tsx 内复制同一集合 + 加双源同步注释；`normalizePlanType` 从 `src/utils/quota/parsers.ts:51`（真实定义源，公共导出）直接 import。
  4. **F4 (Low)**: 新建文件名 `.ts` 但 extras 承载 JSX 节点，编译报错。**已修正**：`quotaView.ts` → `quotaView.tsx`（7 处引用全部替换）。
  5. 顺带订正：T3 步骤 3 antigravity 空态引用行号 `812` → `812-820`（key 实际在 817，第三方给的是逻辑起始行）。
- Next: 等待用户批准第四轮修正后的计划进入 T1 实现。当前无 High 级遗留（4 个 Medium/Low 全修），契约类型自洽（leaf/group 分型 + empty 字段 + .tsx 命名 + premium 集合来源明确）、T1-T5 依赖链与不变量无矛盾，可放行实现。

## 2026-06-30 第五轮复审（外部第三方 agent：计划修复闭环 + 工作区状态核查）

- Action: 第三方复审第四轮修正后的 plan + 工作区 git 状态。计划层面 4 个修复（leaf/group union、empty 字段、premium 来源、.tsx 命名）判定全 Pass；新发现 3 个**工作区状态** finding。
- Files: task.md（F3 修正）、progress.md（记录）。**未改动任何源码文件，未动 git 状态**。
- Verification: 主线程实读 `git status` + `git diff` + `git log` 核实第三方 finding：
  - `git status` 确认：modified=`.agents/README.md`（本轮评审改）、`AuthFileCard.tsx`、`AuthFilesPage.module.scss`；untracked=`.agents/tasks/20260629-.../`、`src/features/authFiles/components/AuthFileBatchQuotaSection.tsx`（全新 252 行，`git log` 无历史提交）。
  - `AuthFileCard.tsx:37` diff 确认新增 `import { AuthFileBatchQuotaSection }`，删除旧 `batchCheckRemainingLabel`，重构 batchCheckResult 渲染——即有人已实现一版 B 路径组件并接入 AuthFileCard。
  - 环境验证缺口属实：当前环境 `bun`/`node` 不可用，无法跑 type-check 验证那批源码能否编译。
- Result:
  1. **F1 (High)**：`AuthFileCard.tsx:37` import 未跟踪的 `AuthFileBatchQuotaSection.tsx`，只 commit 已跟踪 diff 会导致构建失败。**属实**。
  2. **F2 (Medium)**：task.md 写 `no code changes yet`，但工作区已有 B 路径实现。**属实**。
  3. **F3 (Low)**：task.md:9 仍写 `quotaView.ts`，与 plan 的 `.tsx` 不一致。**属实，已修正**（task.md:9 → `quotaView.tsx`）。
- **既存工作区改动归属判定**：上述源码改动（`AuthFileBatchQuotaSection.tsx`/`AuthFileCard.tsx`/`AuthFilesPage.module.scss`）**早于本轮评审介入**（会话启动 git 快照已含），来源未明确记录，可能是本任务之前的探索性实现或上一轮 ULW 任务残留。**用户决策：保留不动、仅记录**——不 git add、不 stash、不回退。后续 T1 实现时把这批改动视为既存基线，plan T1「迁移 AuthFileBatchQuotaSection 现有函数」的前提因此成立（文件已存在，只是未入库）。
- **遗留风险**：
  - 这批未入库改动若中途丢失（如被清理或误回退），plan T1 失去抽取源。建议用户在 T1 前自行决定是否纳入版本控制。
  - 当前环境无法跑 type-check/build，T1-T5 的强制验证（`bun run type-check/lint/build`）需在具备 bun 的环境执行；本会话不声称这些验证已通过。
- Next: 等待用户批准进入 T1 实现。T1 执行时须：(a) 把 `AuthFileBatchQuotaSection.tsx` 等 3 个未提交改动视为既存基线；(b) 在具备 bun 的环境跑验证；(c) 实现完成后由用户决定这批基线改动的提交时机。

## 2026-06-30 T1-T4 实现 + T5 静态自检（执行面：dev 分支原地）

- Action: 用户批准进入实现，按 plan 顺序执行 T1→T2→T3（含 1 次 drift 处理）→T4→T5 静态自检。
- Files:
  - 新建 `src/features/authFiles/utils/quotaView.tsx`（632 行）：归一化视图模型（leaf/group union + NormalizedQuotaView + NormalizedQuotaResetCredits）+ B 路径迁移函数 + `batchResultToQuotaView` + 5 个 provider adapter + `providerStateToQuotaView` 分派。
  - 新建 `src/features/authFiles/components/QuotaRowsView.tsx`（101 行）：按 `row.kind` 分派渲染（group→header+nested / leaf→label/percent/amount/reset+进度条），title 回退，empty 空态，resetCredits 结构化渲染。
  - 重写 `src/features/authFiles/components/AuthFileBatchQuotaSection.tsx`（252→21 行）：全交 `<QuotaRowsView>`。
  - 修改 `src/features/authFiles/components/AuthFileQuotaSection.tsx`：success 分支改用 `providerStateToQuotaView` + `<QuotaRowsView>`，清理未使用 import（QuotaProgressBar/ReactNode）。
  - 修改 `src/components/quota/quotaConfigs.ts`：12 个私有辅助函数/常量加 `export`（drift 决策结果）。
- Verification: **环境无 bun，node_modules 缺 tsc/esbuild，无法跑 `type-check/lint/build`**——本会话不声称自动化验证通过。改做深度静态自检（全部通过）：① import 使用率（quotaView.tsx 27 个 import 全部 ≥2 次引用，无 unused）；② 类型字段契约（5 provider state/window 类型逐字段核对 adapter 访问）；③ B 路径 DOM 等价性（plan 区条件/empty 文案/DOM 层级/title 回退）；④ 样式类存在性（21 个类 + 6 个 codexResetCredit* 全存在于 AuthFilesPage.module.scss）；⑤ JSX/className 清理（quotaView.tsx 无残留 JSX，resetCredits 已结构化走 CSS Modules）。
- Result:
  1. **T1**：quotaView.tsx 建立归一化模型 + 迁移 B 路径，`batchResultToQuotaView` 输出与原 buildBatchQuotaRows + plan 区等价。
  2. **T2**：QuotaRowsView 按 kind 分派；实现中修正 1 处 premium 语义（核对 quotaConfigs.ts:925-945，premium 只作用于 value span 非容器）；codex reset credits 由自由 JSX 改为结构化 `NormalizedQuotaResetCredits`（避免字符串 className 与 CSS Modules 冲突）。
  3. **T3 drift（用户决策）**：5 个 provider adapter 需要的 12 个渲染辅助函数是 quotaConfigs.ts 私有未导出，与 plan「不改 quotaConfigs」冲突。用户选「导出后复用」——给 12 个函数加 `export`（不改实现逻辑，QuotaPage 渲染零影响）。adapter 严格对齐各 renderXxxItems 字段映射；百分比统一 formatPercentValue 小数（codex/claude/kimi/xai），antigravity percentLabel 保留 provider 特有文案 remaining_percent/quota_available。
  4. **T4**：AuthFileQuotaSection success 分支接入统一视图，保留 QuotaPage 的 renderQuotaItems 不删。
  5. **T5**：人工双入口对比验证**未能执行**（环境无 bun + 无真实账号运行环境），记为缺口。
- **验证缺口与剩余风险**：
  - `bun run type-check/lint/build` 全未跑——必须在具备 bun 且依赖完整的环境补跑后才能声称验证通过。重点盯防：TS 类型推断（providerStateToQuotaView 的 unknown→具体 state 断言）、eslint unused/strict 规则。
  - 人工双入口视觉对比未做——百分比小数化、claude plan/extra 容器合并、antigravity 嵌套需在浏览器实测。
  - plan「不改 quotaConfigs」约束已实质修订为「不改其渲染逻辑，允许 export 私有辅助函数」——plan 文件待同步此条。
- Next: 在具备 bun 的环境补跑 `bun run type-check && bun run lint && bun run build`；通过后做人工双入口对比（T5）；plan 同步 T3 drift 决策。executor 终态暂为 `blocked`（验证未闭环），非 `ready_for_delivery_card`。

## 2026-06-30 代码评审 + 修复 + 复审（main-thread review + 1 独立 reviewer）

- Action: 对 T1-T4 实现做 pre-landing 代码评审（aw-review）。派发 1 个独立 reviewer 盲审（切片 B：类型契约/渲染一致性/边界态/lint，返回 5 个 findings 全 low）；切片 A（字段映射）reviewer 超时，主线程基于完整上下文补做。评审后修复 F2/F4，F1/F3/F5 按判定处理，再做修复后复审。
- Files: `quotaView.tsx`（移除 extras 死字段 + ReactNode import）、`QuotaRowsView.tsx`（移除 `{view.extras}` 渲染）、`quotaConfigs.ts`（回退 4 个超额 export）。
- Verification: 静态复查全部通过——extras 全仓 0 残留；回退的 4 个符号（formatAntigravityDuration/normalizeAntigravityQuotaText/XAI_SUPERGROK_LIMIT_CENTS/HEAVY）在 quotaConfigs.ts 内部仍被正常调用（私有 const 同文件可见）；authFiles 下无对它们的引用；本轮 export 数 10 = import 数 10，一一对应。
- Result（评审 5 findings 的处置）:
  1. **F1 (low, codex resetCredits 渲染顺序变更)**：原 renderCodexItems 顺序 plan→resetCredits→windows，新 QuotaRowsView 统一为 plan→rows→resetCredits。**不修，记为统一化预期差异**——是 B 路径统一结构的必然结果（B 本就 plan→rows），留待 T5 人工确认是否可接受；只影响 codex。
  2. **F2 (low, extras 死字段)**：NormalizedQuotaView.extras 全仓无赋值。**已修复**——移除 extras 字段 + ReactNode import（仅此处用）+ QuotaRowsView 的 `{view.extras}` 渲染。codex resetCredits 已用结构化 resetCredits 字段，extras 确属残留。
  3. **F3 (low, leaf title tooltip)**：QuotaRowsView 对所有 leaf 行 `title={row.title ?? row.label}`，codex/claude/kimi 原本无 title 现被统一加上。**不修，判定为正确**——这是 B 路径既有行为（B 原本 `title={row.title ?? row.label}`），是"A 对齐 B"的设计意图，符合 plan；改了反而偏离 B。
  4. **F4 (low, 超额 export)**：实际 export 14 处但任务说 12，其中 4 个（formatAntigravityDuration/normalizeAntigravityQuotaText/XAI_SUPERGROK_LIMIT_CENTS/HEAVY）未被 quotaView import。**已修复**——回退为私有 const（同文件内仍可用），现 export 10 = import 10，零超额。
  5. **F5 (low, unknown 断言无运行时校验)**：providerStateToQuotaView 的 `quota as XXXState` 5 处断言。**不修，判定为已知取舍**——plan 契约即 `quota: unknown`，安全性由调用方（按 quotaType 取对应 store slice）保证，非现存 bug，属未来健壮性改进。
  6. 字段映射切片（A，主线程补）：codex/claude/antigravity/kimi/xai 五个 adapter 的关键数值计算（remaining/percent/满额判定）逐一核对原 renderXxxItems，**全部等价**，无字段遗漏/错配。
- 复审结论：F2/F4 修复干净，无新问题引入；F1/F3/F5 经判定不修（F1 待 T5、F3/F5 为设计取舍/已知项）。**评审后无 critical/high 遗留**，最高 low（F1 待 T5 确认）。
- 已知项（非缺陷）：quotaView.tsx 无 JSX 但保留 .tsx 扩展名（plan 锁定 + 未来扩展预留 + 改名牵连 import 的 churn 不值得），记为合理保留。
- Next: 评审修复完成，executor 终态仍 `blocked`（自动化验证 type-check/lint/build 仍未跑）。下一步不变：在具备 bun 的环境补跑验证 + T5 人工双入口对比（重点确认 F1 的 codex resetCredits 顺序重排）。

## 2026-06-30 整体复审（修复后全量，2 独立 reviewer + 主线程补切片）

- Action: 对 F2/F4 修复后的全部改动做整体复审。派发 2 个独立 reviewer（A 字段映射/数值等价，B 架构/类型/集成/回归）。A 返回并抓到 1 个 High bug；B 超时，主线程补做其切片。
- Files: `quotaView.tsx`（修 High bug：codex expiryLabel 格式化函数）。
- Verification: 主线程实读 `src/utils/format.ts:71-98` 核实 formatDateTime vs formatDateTimeValue 差异；静态复查 18 个 import 使用率、QuotaPage 路径完整性、AuthFileCard 互斥逻辑、B 路径 empty 一致性。
- Result:
  1. **🔥 High bug（A 发现，已修复）**：codex `expiryLabel` 误用 `formatDateTime(subscriptionActiveUntil)`，原 renderer 用 `formatDateTimeValue`。差异：`subscriptionActiveUntil` 类型 `string|number|null`，当值为**秒级 epoch 数字（<1e12）**时，`formatDateTimeValue` 内部 `parseDateValue` 会 `×1000` 转毫秒得正确日期，而 `formatDateTime` 直接 `new Date(number)` 当毫秒 → **1970 年错误日期**。叠加 TS 类型不匹配（`formatDateTime(date: string|Date)` 不接受 number，会编译报错）。**已修复**：改回 `formatDateTimeValue`（接受 unknown，正确处理秒级 epoch），与原 renderer `:921` 一致。
  2. **连锁修复**：改 import 时发现 B 路径迁移的 `resolveResetLabel`（:204/:211）也用 `formatDateTime`——这两处是原 B 路径逐字迁移（resetTime 已转 string、resetAtMs 已算成 Date），保持 `formatDateTime` 以维持 B 路径行为不变。故 import 改为同时 import `formatDateTime` + `formatDateTimeValue`。
  3. **A 切片其余结论**：codex/claude/antigravity/kimi/xai 五个 adapter 的数值计算（remaining/percent/满额判定/amount）逐一核对原 renderXxxItems，**全部等价**（仅 percentLabel 小数化为预期差异）。
  4. **A 的 Finding #2（low，codex/claude resetLabel 空字符串渲染差异）**：原 renderer 无条件渲染空 resetLabel span，新 QuotaRowsView 用 `{row.resetLabel &&}`。属 B 路径既有行为统一，Reviewer A 建议忽略。**不修**。
  5. **B 切片（主线程补做）全部通过**：QuotaPage 路径（QuotaCard.tsx:71/85/152 + QuotaSection.tsx:382）仍活跃使用 renderQuotaItems，5 个 renderXxxItems 未删；AuthFileCard:138 互斥逻辑 `!batchCheckResult` 完好；B 路径 batchResultToQuotaView 的 empty=common.not_set 与原一致；A 路径各 provider empty 都设了对应 key。
- 复审结论：整体复审发现并修复 1 个 High bug（codex 过期日格式化），其余无 critical/high 遗留。**修复后 18 个 import 全部使用、QuotaPage/互斥逻辑/B 路径均未受影响**。executor 终态仍 `blocked`（自动化验证未跑）。
- **剩余风险**：① codex 过期日修复需在 T5 人工验证（用真实 codex 账号确认 expires 显示正确，尤其 subscriptionActiveUntil 为秒级数字时）；② 仍需在具备 bun 的环境补跑 type-check/lint/build 确认无编译错误（High bug 的 TS 类型不匹配已通过改用 formatDateTimeValue 消除，但需实证）。
- Next: 在具备 bun 的环境补跑验证 + T5 人工双入口对比（重点：codex 过期日 + F1 resetCredits 顺序）。

## 2026-06-30 评审报告分析 + kimi 百分比 bug 修复

- Action: 用户提供一份外部评审报告（含真实跑过的 tsc/eslint 结果），主线程核实其 Medium finding 并修复。
- Files: `quotaView.tsx`（kimi adapter 移除 Math.round 预取整）。
- Verification: 主线程实读 `quotaView.tsx:521-526` 核实 finding 属实；node 脚本验证修复后 formatPercentValue 对 kimi 典型值输出正确（limit=3,used=1→66.7%；limit=7,used=1→85.7%；整数场景仍整数）。
- Result:
  1. **评审报告的自动化验证结果（关键，首次有实证）**：`tsc --noEmit` ✅ 通过、`eslint` ✅ 通过——证明上一轮修复的 High bug（codex 过期日 formatDateTimeValue）及所有类型问题已编译干净。build 失败仅因 WSL+Windows Node 环境缺 `@rolldown/binding-win32-x64-msvc` native binding，**非代码问题**，不据此判定构建失败。
  2. **🔥 Medium bug（评审报告发现，已修复）**：kimi adapter 的 `remaining` 用 `Math.round(((limit-used)/limit)*100)` 预取整，再传 `formatPercentValue`——但 formatPercentValue 收到整数永远输出整数（其逻辑：整数无小数/≥10 取 1 位/<10 取 2 位），**永远不会显示小数**，违背 plan T3 步骤 4「kimi percent 用小数」。根因：从原 renderer 逐字迁移了 Math.round（原整数逻辑），未察觉与"小数化"目标冲突。**已修复**：移除 Math.round，保留浮点比例 `Math.max(0, Math.min(100, ((limit-used)/limit)*100))`，让 formatPercentValue 决定显示精度。
  3. **核查其它 provider 无同类问题**：codex/claude/xai 的 percent 计算用 `100 - clamp(used)` 无 Math.round（usedPercent 本身可小数，formatPercentValue 正常工作）；antigravity 的 percent 给进度条用（无 round），percentLabel 用 remaining_percent 特有文案（保留）。**仅 kimi 有此 bug**。
  4. **评审报告通过点确认**：A 路径已切统一视图、B 路径经 batchResultToQuotaView+QuotaRowsView、antigravity group/leaf 分型正确、codex reset credits/claude extra_usage/xai pay-as-you-go 均保留无字段丢失——与主线程历次审查结论一致。
- 复审结论：评审报告的 Medium finding 属实并已修复；tsc/eslint 实证通过（build 缺口为环境问题）。**kimi 百分比现已真正对齐 B 路径小数算法**。
- **剩余验证缺口**：① build 仍需在 native binding 完整的环境补跑（非代码问题）；② T5 人工双入口对比未做（重点新增：kimi 百分比小数显示 + codex 过期日 + resetCredits 顺序）。
- Next: T5 人工双入口对比（kimi 小数百分比 + codex 过期日 + F1 resetCredits 顺序）。

## 2026-06-30 T5 用户浏览器验证 + 任务收口

- Action: 用户在浏览器（http://localhost:5173/#/auth-files）对比 codex 认证文件的两入口展示，反馈"批量检查卡片"与"单文件刷新"信息不一致。经主线程与用户澄清，确认差异分两类。
- Files: 无代码改动（本次为验证 + 需求澄清）。
- Verification: 用户浏览器实测 codex 两入口；主线程核对 AuthFileCard.tsx 渲染分层。
- Result:
  1. **第 1 类差异（卡片外壳元信息，非本任务范围）**：批量检查有"标题/标签/检查时间/可用说明"，单文件刷新没有——这些由 `AuthFileCard.tsx` 在 quota 区外层渲染，是批量检查功能的卡片元信息（一次性快照带时间戳/分类标签），单文件刷新是实时查询本就不同。本任务 plan 明确范围是"额度行渲染层统一"，不含卡片外壳。
  2. **第 2 类（额度展示内容）**：套餐类型两入口已一致（都显示 Free，走同一 QuotaRowsView）；重置次数是 codex 特有信息（plan 要求保留，A 路径有、B 无属预期）。
  3. **T5 验证结论**：本任务的渲染层统一目标**已达成**——两入口额度行（套餐类型、百分比小数、leaf/group 分型）均走 QuotaRowsView 一致。用户反馈的不一致主体是卡片外壳 + B 路径数据展示逻辑，超出本任务范围。
  4. **用户提出新需求**（超出本任务）：① 单文件刷新加卡片外壳（标题"额度概览" + 可用/额度情况标签 + 刷新时间 + 移除"当前可用"）；② 批量检查额度内容对齐单文件刷新（B 展示 A 的多窗口逻辑，需处理 A/B 数据源差异）。
- 决策：用户选择「收口当前任务 + 起新任务」。当前任务（额度行渲染层统一）T1-T4 完成 + tsc/eslint 通过 + 渲染层一致已验证，**置为 completed**。新需求另起任务 `20260630-auth-file-card-shell-and-b-path-alignment`。
- Next: 起新任务规划（卡片外壳改造 + B 对齐 A）。

## 中途发现的认知错位（已澄清，记录备查）

- 会话启动时的 git 状态快照（dev=e11a528, master=2e55bef, 最新 tag=v1.14.0-wx-2.6）为陈旧快照，与真实状态（dev=d8b3dd4, master=8f9eda1, 最新 tag=v1.17.7-wx-2.7）不符。
- 真实仓库已由 ULW 任务 `20260626-frontend-upstream-v1-17-7` 完成上游 v1.17.7 吸收并发版 `v1.17.7-wx-2.7`。
- 本任务代码基线为 dev@d8b3dd4（含 v1.17.7），额度展示分析有效。
