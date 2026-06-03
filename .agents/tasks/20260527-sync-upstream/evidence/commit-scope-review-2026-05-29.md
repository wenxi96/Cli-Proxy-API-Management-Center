# Commit Scope Review - 2026-05-29

## 复核基线

- 当前 fork 执行入口: `dev == master == origin/dev == origin/master == fac0e6f`
- 上游目标: `upstream/main == 87702bb`
- 当前 merge-base: `808f44d`
- 实测候选提交数: `git log --oneline dev..upstream/main | wc -l` = 70
- 原计划问题: 直接 `git merge upstream/main` 会同时吸收先前明确跳过的 15 个 commit，不满足任务非目标。

## 分类定义

- `continue_skip`: 先前已决策忽略，本次继续不主动吸收。
- `absorb`: 本次需要吸收的新功能、修复或必要重构。
- `selective_absorb`: 只吸收与 fork 目标兼容的内容；保留 fork CI/release、Bun lockfile、定制行为等边界。
- `metadata_skip`: merge commit 或等价历史元数据，不单独 cherry-pick；若其内容已由子提交覆盖则跳过。
- `no_op_or_verify_absent`: 上游中间态添加后又删除，fork 目标是保持最终不存在；不主动吸收添加提交，只验证最终状态。

## 逐项复核表

| # | Commit | Date | Subject | Decision | 复核说明 |
|---|---|---|---|---|---|
| 1 | `a4d1c23` | 2026-04-30 | add toggle functionality for enabling/disabling OpenAI providers | continue_skip | 先前跳过项；触及旧 OpenAI provider 页面，后续 `34a050d` 已移除旧页面架构。 |
| 2 | `cc8632b` | 2026-04-30 | adjust opacity style condition for OpenAI provider card | continue_skip | 先前跳过项；旧 provider card 样式，后续新 provider 架构会替代。 |
| 3 | `8ed837c` | 2026-04-30 | adjust log panel and filter styles | continue_skip | 先前跳过项；日志样式优化不属于本次目标。 |
| 4 | `b25f722` | 2026-05-02 | provider usage tracking via recent requests | continue_skip | 先前跳过项；大范围触及旧 provider usage/auth files stats，风险高且后续 provider 重构另行吸收。 |
| 5 | `7d3c570` | 2026-05-02 | streamline auth file editor logic | continue_skip | 先前跳过项；触及 auth file editor，避免与 fork batch/check 定制叠加。 |
| 6 | `632be0b` | 2026-05-02 | remove unused chart configuration and latency utilities | continue_skip | 先前跳过项；大范围删除 usage/chart 相关模块，超出本次同步新功能边界。 |
| 7 | `011cd3b` | 2026-05-02 | provider stats total stats refactor | continue_skip | 先前跳过项；后续 `87702bb` 将在新 provider 架构上提供最终 stats 展示，应以后者为准。 |
| 8 | `6a10082` | 2026-05-02 | move mobile sidebar toggle left | continue_skip | 先前跳过项；fork 已有 mobile 可达性定制，避免重复吸收旧样式。 |
| 9 | `15e32ee` | 2026-05-02 | upgrade vite toolchain | continue_skip | 先前跳过项；依赖升级不直接作为本次目标，后续 Bun 版本更新单独选择性处理。 |
| 10 | `789f003` | 2026-05-02 | migrate vite single-file output config | continue_skip | 先前跳过项；构建配置属于 fork release 边界，继续不主动吸收。 |
| 11 | `1a056ec` | 2026-05-02 | use valid dark theme selector | continue_skip | 先前跳过项；旧样式修复，非本次目标。 |
| 12 | `4cfc8b9` | 2026-05-02 | use node 24 for releases | continue_skip | 先前跳过项；fork CI/release 必须保留，仅 tag 触发正式 release。 |
| 13 | `9f7c471` | 2026-05-03 | prevent OpenAI provider card overflow | continue_skip | 先前跳过项；旧 provider page 样式，后续新 provider 架构替代。 |
| 14 | `126f7fa` | 2026-05-03 | keep disabled card actions visible | continue_skip | 先前跳过项；AuthFiles 样式与 fork batch controls 可能重叠，继续不主动吸收。 |
| 15 | `62092cc` | 2026-05-10 | make Chatgpt-Account-Id optional | continue_skip | 先前跳过项；quota config 行为变化，非本次目标。 |
| 16 | `57eeff5` | 2026-05-17 | add xAI provider OAuth support | absorb | 本次验收条件明确包含 xAI provider OAuth，必须吸收。 |
| 17 | `4ef2936` | 2026-05-17 | premium plan mobile styling | absorb | 低风险 UI 样式修复，属于上游新变更；需移动端回归。 |
| 18 | `a292267` | 2026-05-18 | Grok dark icon and provider key normalization | absorb | xAI/Grok 支持链路的一部分，必须与 `57eeff5` 一起吸收。 |
| 19 | `9e77afa` | 2026-05-18 | README minimum version/install commands | selective_absorb | 文档可吸收，但不得覆盖 fork 定制说明；若与 fork release 文档冲突，以 fork 为准。 |
| 20 | `4ef5869` | 2026-05-18 | Antigravity Credits localization and ConfigPage styles | absorb | 原计划冲突点 #4，需与 Scoped Poll 定制共存。 |
| 21 | `cd1e7ff` | 2026-05-18 | ConfigSection responsive layout styles | absorb | 原计划冲突点 #4，需吸收样式并保留 fork VisualConfigEditor 结构。 |
| 22 | `d6f5c45` | 2026-05-18 | add Home control plane settings | no_op_or_verify_absent | 上游中间态添加，后续 `f0d669f` 删除；fork 目标是最终无 Home Control Plane UI，不主动吸收添加。 |
| 23 | `300f73e` | 2026-05-18 | handle html challenge content | absorb | 原计划 Auth Files 修复，需吸收。 |
| 24 | `bb0c0a7` | 2026-05-18 | keep invalid content copyable | absorb | 原计划 Auth Files 修复，需吸收。 |
| 25 | `f0d669f` | 2026-05-19 | remove Home control plane configuration | no_op_or_verify_absent | 不主动 cherry-pick 删除中间态；验证最终路由/配置中无 Home Control Plane UI。 |
| 26 | `77e7dd0` | 2026-05-19 | filter controls search | absorb | 原计划冲突点 #3，需与 fork AuthFiles 筛选布局合并。 |
| 27 | `9a7cb37` | 2026-05-19 | Merge PR #279 | metadata_skip | merge commit，无需单独吸收；子提交已单独分类。 |
| 28 | `f8fdd9b` | 2026-05-19 | update dependencies and remove baseUrl | selective_absorb | 可吸收 tsconfig/package 必要变化，但拒绝引入 `package-lock.json` 作为最终产物。 |
| 29 | `65f8b23` | 2026-05-19 | docs minimum version/TypeScript version | selective_absorb | 文档按 fork 实际支持版本选择性吸收。 |
| 30 | `ef7b63e` | 2026-05-19 | update package.json | selective_absorb | 依赖/脚本需逐项对照 fork package，避免覆盖 Bun/release 定制。 |
| 31 | `075c2fa` | 2026-05-20 | login error backend response details | absorb | 登录错误信息改进，独立修复，低耦合。 |
| 32 | `2cb98ad` | 2026-05-20 | preserve source draft on visual save | absorb | Config 保存修复，需与 VisualConfigEditor/Scoped Poll 共存。 |
| 33 | `eab1995` | 2026-05-20 | strictly parse provider edit indexes | selective_absorb | 旧 edit page 路由后续被新 provider 架构替代；执行时可能成为 no-op，仅保留仍适用于最终 provider 路由的解析逻辑。 |
| 34 | `0fa6b74` | 2026-05-21 | remove unused hooks and utils | selective_absorb | 清理类提交，仅删除确认已无引用的文件，避免误删 fork 定制依赖。 |
| 35 | `57a3063` | 2026-05-23 | update package manager to bun@1.3.14 | selective_absorb | 吸收 Bun 版本与 `bun.lock` 相关变化；保留 fork CI/release 触发策略，最终不保留 `package-lock.json`。 |
| 36 | `a44bcd3` | 2026-05-24 | provider configuration serialization | absorb | 新 provider 架构基础能力，DisplayName 重建需基于该序列化路径。 |
| 37 | `9a5c2b0` | 2026-05-24 | xAI/Grok quota management | absorb | xAI/Grok 支持链路的一部分，需吸收。 |
| 38 | `34a050d` | 2026-05-24 | remove deprecated AI provider edit pages | absorb | 核心架构重构；DisplayName 需在新架构重建。 |
| 39 | `1ceb7e1` | 2026-05-25 | provider table metrics display | absorb | 新 provider workbench 功能，需吸收并保护 displayName title 逻辑。 |
| 40 | `47ba6ab` | 2026-05-25 | inline enable/disable toggle | absorb | 新 provider workbench 功能，替代旧 provider toggle 路径。 |
| 41 | `bf299cf` | 2026-05-25 | OpenAI/Claude connectivity test | absorb | 新 provider form 功能，需与 authIndex/displayName 共存。 |
| 42 | `4711db9` | 2026-05-25 | reset connectivity status only for changed key | absorb | provider connectivity 修复，需吸收。 |
| 43 | `191a4c5` | 2026-05-25 | model discovery panel | absorb | 新 provider form 功能，需吸收。 |
| 44 | `fafc4b7` | 2026-05-25 | status bar, sort and model filter | absorb | 新 provider workbench 功能，需吸收。 |
| 45 | `c23fd69` | 2026-05-25 | preserve alias in discovered models | absorb | provider model discovery 修复，需吸收。 |
| 46 | `dd3c39e` | 2026-05-25 | retry OpenAI discovery without auth | absorb | provider discovery 修复，需吸收。 |
| 47 | `8c3c9c1` | 2026-05-25 | confirm discarding unsaved edits in sheet | absorb | provider sheet UX 修复，需吸收。 |
| 48 | `87ddd62` | 2026-05-25 | connectivity test model dropdown | absorb | provider form 功能，需吸收。 |
| 49 | `7e9c5be` | 2026-05-25 | forward apiKey/authIndex to discovery/tests | absorb | authIndex/provider connectivity 必要修复，需吸收。 |
| 50 | `cb26c96` | 2026-05-25 | label missing authIndex as not-set | absorb | provider detail UX 修复，需吸收。 |
| 51 | `48b9879` | 2026-05-25 | authIndex in request headers/signature | absorb | authIndex 功能链路必要修复，需吸收。 |
| 52 | `85d6b76` | 2026-05-25 | Select small size and provider styling | absorb | 新 provider UI polish，需吸收并做视觉/移动端回归。 |
| 53 | `844385e` | 2026-05-25 | remove dead provider exports | absorb | 新架构清理，需随 `34a050d` 吸收。 |
| 54 | `4142d91` | 2026-05-25 | remove unused HeaderInputList/ModelInputList | absorb | 新架构清理；确认旧 pages 已删除后吸收。 |
| 55 | `4a7dbf2` | 2026-05-25 | drop unused ai_providers namespace | selective_absorb | i18n 清理需谨慎；DisplayName 与 fork 定制文案必须保留或迁移。 |
| 56 | `b9f3d18` | 2026-05-25 | remove orphan Login.module.scss | absorb | 清理孤儿样式，低风险。 |
| 57 | `0992b8b` | 2026-05-25 | remove redundant type comment | absorb | 低风险类型注释清理。 |
| 58 | `33df506` | 2026-05-25 | restore Codex websockets toggle | absorb | 原计划 Auth Files 修复，需吸收。 |
| 59 | `d2ab416` | 2026-05-25 | fetch recent requests on mount | absorb | provider stats/workbench 修复，需吸收。 |
| 60 | `1aa9988` | 2026-05-25 | honor authIndex for discovery/connectivity | absorb | authIndex/provider connectivity 修复，需吸收。 |
| 61 | `42c0e7b` | 2026-05-25 | confirm discarding unsaved edits on category switch | absorb | provider workbench UX 修复，需吸收。 |
| 62 | `2c641f8` | 2026-05-26 | Merge PR #287 | metadata_skip | merge commit，无需单独吸收；相关子提交已单独分类。 |
| 63 | `c2b19d2` | 2026-05-26 | authIndex to API key entries/connectivity | absorb | provider authIndex 完整链路必要功能，需吸收。 |
| 64 | `5815053` | 2026-05-26 | Merge remote-tracking branch origin/dev | metadata_skip | merge commit，无需单独吸收。 |
| 65 | `8d3a482` | 2026-05-26 | keep Codex websocket labels translated | absorb | 原计划 Auth Files 修复，需吸收。 |
| 66 | `544b365` | 2026-05-26 | navigation groups and metadata | absorb | 上游导航结构更新，需吸收并验证移动端 sidebar 可达。 |
| 67 | `4d6a5da` | 2026-05-26 | icons/layout consistency | absorb | 布局/图标一致性更新，需移动端回归。 |
| 68 | `432438e` | 2026-05-26 | sidebar-toggle style update | absorb | 上游 sidebar 样式更新，但需与 fork mobile 可达性定制共存。 |
| 69 | `d64210f` | 2026-05-26 | page transition accessibility | absorb | 可访问性改进，需吸收。 |
| 70 | `87702bb` | 2026-05-26 | provider stats total calculation/display | absorb | 上游目标 HEAD 功能，需吸收并与先前跳过的 `011cd3b` 区分。 |

## 复核结论

- 继续忽略: 15 个先前跳过项（#1-#15）。
- 本次吸收: 43 个普通提交。
- 选择性吸收: 9 个提交（docs/package/cleanup/i18n/route parsing 等）。
- merge 元数据跳过: 3 个提交。
- Home Control Plane 中间态: 2 个提交不主动应用，仅验证最终不存在。
- 因继续忽略祖先链中的 15 个提交，本次不应使用 `git merge upstream/main` 作为主策略；应使用选择性 replay/cherry-pick 或等价手动补丁方式吸收本次确认范围。
