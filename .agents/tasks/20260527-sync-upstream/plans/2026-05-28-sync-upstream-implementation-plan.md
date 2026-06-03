# 同步上游 upstream/main → fork master 实施计划

- 目标: 将 `upstream/main@87702bb` 中本次复核确认的新功能/修复吸收到 fork `master/dev@fac0e6f`，保留全部 fork 自定义功能不丢失
- 输入模式: clear-requirements
- 需求来源: `../task.md`、`../findings.md`、`../evidence/commit-scope-review-2026-05-29.md`
- Canonical Spec 路径: None
- 范围边界:
  - 候选范围: `dev..upstream/main` 实测 70 个 commit
  - 继续忽略: 先前跳过的 15 个 commit（详见 `../findings.md` 与 commit scope review）
  - 本次吸收: 按 `../evidence/commit-scope-review-2026-05-29.md` 中 `absorb` / `selective_absorb` / `no_op_or_verify_absent` 结论执行
  - 执行入口: 从 `dev/master@fac0e6f` 创建 `chore/sync-upstream-2026-05-26`
- 非目标:
  - 不通过普通 `git merge upstream/main` 间接吸收先前跳过的 15 个 commit
  - 不改动 fork CI/release 的核心策略（正式 release 仅 tag 触发，保留 fork 后缀）
  - 不保留上游 `package-lock.json` 作为最终交付产物，除非用户另行确认
  - 不在本计划中调整其他历史定制
- 约束:
  - 冲突解决以 fork 定制为主，上游新功能在 fork 结构上叠加
  - DisplayName 走方案 A：在新 provider 架构中重建 displayName 字段
  - 推送 origin 必须取得用户明确授权，不与本地合并动作合并执行
  - 若任何执行策略会吸收 `continue_skip` commit，必须停下重新选择 replay/cherry-pick 或手动补丁路径
  - 任务 2-6 必须保持 direct_inline 顺序执行；除非重新做多 agent 写入边界设计，否则不得并行修改 i18n、routing、package/CI 等共享文件
- 细化层级: contract-first
- 执行路由: direct_inline
- 为什么使用该路由: 单 agent 可顺序执行范围门禁、选择性吸收、冲突解决和验证；但不再使用普通 merge，降低错误吸收跳过项的风险
- 升级触发条件:
  - 选择性 replay 后冲突文件 >= 12 个，或任一冲突解决预计修改 >= 8 文件且涉及 >= 2 个新核心抽象 → 升级 multi_agent
  - 跨 session 中断或 loop 数 >= 3 → 升级 ulw_governed
  - 无法在不吸收 `continue_skip` commit 的前提下得到可构建结果 → 停下请求用户决策
  - 若需要 multi_agent，必须先按共享文件域切分写入所有权；i18n、routing、package/CI 不能被多个 agent 并发修改

## 文件结构

- 新建:
  - `src/features/providers/sheets/forms/ClaudeForm.tsx` 等新架构表单中的 displayName 字段（具体路径以选择性吸收后的实际架构为准）
- 修改:
  - Provider 新架构、Auth Files、VisualConfigEditor、i18n、routing、package/build/CI 相关文件，最终以选择性 replay/cherry-pick 后的实际 diff 为准
- 读取:
  - `../task.md` `../findings.md` `../handoff.md`
  - `../evidence/commit-scope-review-2026-05-29.md`
  - 上游 commit `34a050d` 引入的新 provider 架构源文件
- 测试:
  - `bun run type-check`
  - `bun run lint`
  - `bun run build`
  - dev server 手动验收 `../task.md` 验收条件

## 任务拆分

### 任务 0：范围与工作区门禁

- 目标: 在任何代码吸收前确认范围、工作区、跳过策略和选择性吸收技术路径仍成立
- 文件:
  - 读取: `../task.md`、`../findings.md`、`../evidence/commit-scope-review-2026-05-29.md`
  - 修改: `../progress.md`
- 依赖: None
- 验证: `git status --short --branch` 显示除治理产物外无待合并代码改动；`git rev-parse --short dev master upstream/main` 确认 `dev/master@fac0e6f` 与 `upstream/main@87702bb`；`git log --oneline dev..upstream/main` 与 commit scope review 一致；在 `../progress.md` 写明任务 1 将采用的具体路径（默认按时间顺序选择性 cherry-pick/replay，跳过 `continue_skip`、`metadata_skip` 与 Home 中间态）
- 停止条件: 若 `upstream/main` 前进、`dev/master` 不再是 `fac0e6f`、用户要求变更跳过策略、或无法明确任务 1 的具体选择性吸收路径，停止并重新复核范围

### 任务 1：创建工作分支并选择性吸收提交

- 目标: 基于 `dev/master@fac0e6f` 创建 `chore/sync-upstream-2026-05-26`，按 commit scope review 的顺序选择性吸收本次范围，避免吸收 `continue_skip` commit
- 文件:
  - 修改: 仓库 git 状态（工作分支）
  - 读取: `../evidence/commit-scope-review-2026-05-29.md`
- 依赖: 任务 0
- 步骤:
  - 优先按 `../evidence/commit-scope-review-2026-05-29.md` 的表格顺序 replay：跳过 #1-#15、#27、#62、#64，Home Control Plane #22/#25 只验证最终状态，不主动应用中间态。
  - 对 `absorb` commit 采用 cherry-pick/replay；对 `selective_absorb` commit 只移植与 fork 目标兼容的文件/片段。
  - 按域形成检查点：基础/xAI/config/auth-files → provider 新架构链 → nav/layout/final stats → package/CI 清理。
  - 每个检查点记录实际冲突文件、处理策略和是否需要调整后续任务。
- 验证: `git status` 显示当前在工作分支；选择性 replay/cherry-pick 或手动补丁后，`git log` / `git diff` 不包含先前 15 个跳过 commit 作为直接历史；实际冲突清单写入 `../progress.md`；若中途可构建，运行 `bun run build` 作为检查点证据
- 停止条件: 若只能通过普通 merge 才能继续、任何 `continue_skip` commit 被直接纳入历史、或按时间顺序 replay 因依赖缺口无法继续，必须停下请求用户确认

### 任务 2：解决 Provider 新架构与 DisplayName 重建

- 目标: 吸收上游 provider 新架构和本次 provider 功能，在新架构中重建 DisplayName（Claude/Codex/Gemini/Vertex）
- 文件:
  - 修改: `src/features/providers/types.ts`、`src/features/providers/sheets/forms/BaseProviderForm.tsx`、各 provider 专用 Form、`src/services/api/providers.ts`、`src/i18n/locales/{en,zh-CN,zh-TW,ru}.json`
  - 读取: fork 旧 `src/pages/AiProviders*EditPage.tsx` 与 `src/components/providers/*Section/*Section.tsx` 中原 displayName 实现
- 依赖: 任务 1
- 验证: `bun run build` 通过；编辑界面可输入 displayName 并保存；provider 卡片/详情标题优先展示 displayName；authIndex、connectivity test、model discovery、provider stats 不回归；i18n 文案 4 语言齐全
- 停止条件: 若新架构无法承载 displayName，或需修改后端 API 契约，停下确认是否回退到方案 B 或调整范围

### 任务 3：解决 Auth Files 修复、搜索与 fork 批量检查定制

- 目标: 吸收本次 Auth Files 修复（HTML challenge、invalid content copy、Codex websocket labels/toggle）和搜索 filter，同时保留 fork 批量检查增强、跨页持久化、mobile 可达性和压缩下载
- 文件:
  - 修改: `src/pages/AuthFilesPage.{tsx,module.scss}`、`src/features/authFiles/components/{AuthFilesBatchCheckModal,ReenableTieredModal,AuthFilesPrefixProxyEditorModal}.tsx`、`src/stores/useBatchCheckStore.ts`、`src/features/authFiles/hooks/{useAuthFilesBatchCheck,useAuthFilesData,useAuthFilesPrefixProxyEditor}.ts`、`src/services/api/authFiles.ts`
- 依赖: 任务 2
- 验证: `bun run build` 通过；批量检查模态 + tiered 重启选项正常；结果跨页不丢失；搜索 filter 与 fork 筛选布局并存可用；多选下载仍产出 zip；Codex websocket labels/toggle 正常
- 停止条件: 若上游修复与 fork 重写在同一函数内逻辑互斥，停下记录并请求用户裁定

### 任务 4：解决 VisualConfigEditor、Scoped Poll 与配置样式吸收

- 目标: 吸收上游 ConfigSection/ConfigPage/Antigravity Credits 样式与文案，保留 fork Scoped Poll 总开关、配置项和 AuthFileCard badge
- 文件:
  - 修改: `src/components/config/VisualConfigEditor.tsx`、`src/components/config/VisualConfigEditor.module.scss`、`src/components/config/ConfigSection.module.scss`、`src/pages/ConfigPage.{tsx,module.scss}`、`src/components/providers/{ScopedPoolAuthBadge,utils}.tsx`、`src/hooks/useVisualConfig.ts`、`src/types/visualConfig.ts`、`src/features/authFiles/components/AuthFileCard.tsx`、相关 i18n
- 依赖: 任务 3
- 验证: `bun run build` 通过；范围轮询总开关与配置项正常；保存 visual config 不丢 source draft；AuthFileCard badge 正常；i18n 4 语言齐全
- 停止条件: 若上游样式重构与 fork 范围轮询 DOM 结构耦合，停下评估是否部分回退样式吸收

### 任务 5：处理 xAI/Grok、导航、布局与 Home Control Plane 最终状态

- 目标: 吸收 xAI/Grok OAuth/quota/icon/provider key normalization、导航分组、布局/可访问性更新，并确保 Home Control Plane UI 最终不存在
- 文件:
  - 修改: `src/pages/OAuthPage.tsx`、`src/services/api/oauth.ts`、`src/features/authFiles/constants.ts`、`src/components/quota/*`、`src/pages/QuotaPage.*`、`src/components/layout/MainLayout.tsx`、`src/styles/layout.scss`、`src/components/common/PageTransition.tsx`、相关 i18n
- 依赖: 任务 4
- 验证: `bun run build` 通过；xAI OAuth 入口和 quota 展示可用；Grok dark icon 正常；移动端 sidebar 和 batch check 控件可达；路由/配置中无 Home Control Plane UI 残留
- 停止条件: 若 xAI/Grok 支持需要吸收任何 `continue_skip` commit 的行为作为前置，停下请求用户确认

### 任务 6：处理 package、Bun lockfile、CI/release 与清理提交

- 目标: 选择性吸收 package/build 相关必要更新，保留 fork release 策略，拒绝误保留 `package-lock.json`
- 文件:
  - 修改: `package.json`、`bun.lock`、`vite.config.ts`、`tsconfig.json`、`.github/workflows/release.yml`、必要 README 文件
  - 删除: `package-lock.json`（当前已被 Git 跟踪；若最终决定删除，必须用 Git 删除而不是只加 `.gitignore`）
  - 修改: `.gitignore`（仅在 `package-lock.json` 已从 Git 跟踪中移除后，才考虑加入 ignore 防止再次引入）
  - 读取: `.github/workflows/*`
- 依赖: 任务 5
- 验证: `bun run build` 通过；`package.json` 保持 Bun 项目口径；`bun.lock` 与 package 变更一致；CI/release 仍仅 tag 触发正式 release；无非预期 `package-lock.json`；`vite.config.ts` 保持 single-file output
- 停止条件: 若上游 CI/release 改动与 fork release 策略冲突，保留 fork 策略并记录；若依赖更新需要重新安装且改动巨大，停下请求确认

### 任务 7：编译与手动验收

- 目标: 完成静态验证、构建验证和 fork 定制手动验收
- 文件:
  - 测试: `../task.md` 验收条件清单
  - 修改: `../progress.md`、必要 `../evidence/` 验证摘录
- 依赖: 任务 2、3、4、5、6
- 验证: `bun run type-check` 退出码 0；`bun run lint` 无阻塞问题；`bun run build` 退出码 0；dev server 启动后优先验收 5 项 fork 定制（DisplayName、Auth Files Batch Check 增强、Scoped Poll、多选压缩下载、CI/release 策略），再验收 xAI OAuth、mobile、navigation/provider stats 等上游新功能
- 停止条件: 任一验收条件失败 → 回到对应任务定位回归点；无法连接后端导致无法验证的项必须明确标为未验证风险，不得声称已通过

### 任务 8：合回 master/dev（本地，不推送）

- 目标: 将 `chore/sync-upstream-2026-05-26` 合并回本地 `master` / `dev` 的目标分支
- 文件:
  - 修改: 本地分支引用
- 依赖: 任务 7
- 验证: `git log master --oneline -1` 或目标分支最新提交显示同步结果；`git status` 干净；`.agents` 任务进度已更新
- 停止条件: 仅完成本地合并，不得推送 origin；若目标分支选择不明确，停下确认合回 `master`、`dev` 或两者

### 任务 9：推送授权门（外部副作用，需用户明确授权）

- 目标: 在用户明确授权后，将本地目标分支推送到 origin
- 文件:
  - 修改: 远端 `origin/master` 或 `origin/dev`（以用户授权为准）
- 依赖: 任务 8
- 验证: 用户已明确说出“推送”或等价授权；`git push` 退出码 0；`git ls-remote` 与本地一致
- 停止条件:
  - 用户未明确授权 → 不执行 push
  - 推送遇到 non-fast-forward 拒绝 → 停下，不使用 `--force` 绕过
  - 任务 7 任一验收条件未通过 → 不进入本任务

## 执行交接

- 后续执行者必须从任务 0 开始，不得跳过 commit 范围门禁。
- 任务 2-6 按顺序执行，不并行；若升级 multi_agent，必须先重新划分 i18n、routing、package/CI 等共享文件的写入所有权。
- 每完成一项在 `../progress.md` 追加结构化记录。
- 任务 8 完成后必须停下并明确请求用户授权，再进入任务 9。
- 若中断或跨 session，写入 `../handoff.md` 当前任务编号与未完成的子项。
- 不得使用普通 `git merge upstream/main` 作为默认路径；除非用户明确改判“15 个先前跳过 commit 本次可吸收”。

## 备注

- `../evidence/commit-scope-review-2026-05-29.md` 是本计划的 commit 范围权威证据。
- 选择性吸收的具体技术手段可为 cherry-pick、手动补丁或从上游文件片段移植；选择标准是“不吸收 continue_skip 历史、不丢 fork 定制、最终可验证”。
- commit scope review 中 `eab1995` 可能因旧 edit page 被 `34a050d` 删除而变成 no-op；执行时只保留仍适用于最终 provider 路由的解析逻辑。
