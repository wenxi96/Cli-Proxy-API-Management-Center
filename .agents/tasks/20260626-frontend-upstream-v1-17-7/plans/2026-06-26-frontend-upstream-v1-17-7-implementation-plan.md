# 前端吸收上游 v1.17.7 实施计划

- 目标: 将 `Cli-Proxy-API-Management-Center` 前端 `dev` 吸收到 `main == origin/main == upstream/main == acf432b` / `v1.17.7`，保留 DisplayName、Auth Files Batch Check、Scoped Poll、ZIP 下载和 fork release 策略。
- 输入模式: clear-requirements
- 需求来源: request:用户要求前后端分别落地上游吸收计划、独立审核修复后再改代码
- Canonical Spec 路径: None
- 范围边界: 仅前端仓库；仅 `dev <- main` 的上游吸收、冲突解决、验证与后续 `master` 候选评估；不覆盖后端。
- 非目标: 不 push、不 tag、不 release、不上传 `management.html`；不把后端任务写入本任务目录。
- 约束: 代码改动前必须完成独立审核修复；分支模型保持 `main` 镜像、`dev` 集成、`master` 稳定；保留 `CLAUDE.md` 列出的 5 项 fork 定制。
- 细化层级: contract-first
- 执行路由: ulw_governed
- 为什么使用该路由: 任务跨计划、审核、合并、验证和可能的发版评估多个阶段，并且用户明确要求长任务和多 agent 处理。
- 升级触发条件: AuthFilesPage 冲突需要重新设计状态模型；Provider workbench 与 DisplayName 无法小范围合并；验证失败超过一次且根因不清；需要 push、tag、release 或发布产物。

## 文件结构

- 新建:
  - `.agents/tasks/20260626-frontend-upstream-v1-17-7/task-charter.md`
  - `.agents/tasks/20260626-frontend-upstream-v1-17-7/ulw-board.md`
  - `.agents/tasks/20260626-frontend-upstream-v1-17-7/ulw-state.json`
  - `.agents/tasks/20260626-frontend-upstream-v1-17-7/loops/`
  - `.agents/tasks/20260626-frontend-upstream-v1-17-7/plans/`
  - `.agents/tasks/20260626-frontend-upstream-v1-17-7/evidence/`
- 修改:
  - `.agents/README.md`
  - `src/components/ui/Select.tsx`
  - `src/features/providers/components/ProviderResourceTable.tsx`
  - `src/features/providers/sheets/ResourceDetailView.tsx`
  - `src/i18n/locales/ru.json`
  - `src/features/authFiles/uiState.ts`
  - `src/pages/AuthFilesPage.tsx`
  - `src/services/api/config.ts`
  - `src/services/api/transformers.ts`
  - fork release policy files as preservation checks: `.github/workflows/release.yml`, `scripts/version.sh`, `scripts/release-lib.sh`, `release-metadata.env`, `.github/workflows/sync-upstream.yml`
  - 以及 merge 自动修改的上游文件
- 读取:
  - `CLAUDE.md`
  - `.agents/tasks/20260612-sync-upstream-v7-fork-customizations/`
  - `dev..main`
- 测试:
  - `bun run type-check`
  - `bun run lint`
  - `bun run build`
  - fork 定制人工验证清单，包含 DisplayName、AuthFiles status migration、Batch Check、Scoped Poll、ZIP download、release policy。

## 任务拆分

### 任务 1：计划和提交清单落地

- 目标: 建立前端独立任务目录、提交级吸收清单、冲突策略和 ULW 状态。
- 文件:
  - 新建: `.agents/tasks/20260626-frontend-upstream-v1-17-7/**`
  - 修改: `.agents/README.md`
  - 读取: `.agents/tasks/20260612-sync-upstream-v7-fork-customizations/**`
  - 测试: 检查任务目录中不存在未完成占位语句。
- 依赖: None
- 验证: 文件存在、计划必填字段完整、findings 覆盖 27 个上游提交。
- 停止条件: 发现同目标新任务已存在；`.agents` 持久化模式冲突。

### 任务 2：独立审核修复

- 目标: 由 reviewer/verifier 检查提交吸收建议、冲突策略和验证路径，主线程修正阻断问题。
- 文件:
  - 新建: `.agents/tasks/20260626-frontend-upstream-v1-17-7/coordination/L02-review/`
  - 修改: `.agents/tasks/20260626-frontend-upstream-v1-17-7/findings.md`; `.agents/tasks/20260626-frontend-upstream-v1-17-7/progress.md`
  - 读取: 冲突文件和 `CLAUDE.md`
  - 测试: read-only review; no code tests
- 依赖: 任务 1
- 验证: reviewer/verifier 结论均无阻断项，或阻断项已修正文档并重新审核。
- 停止条件: reviewer 发现需要重设 AuthFiles 状态模型或 Provider 数据契约。
- 交接说明: 多 agent 默认 read-only，禁止直接写业务代码。

### 任务 3：执行 `dev <- main` 合并

- 目标: 在审核通过后，将最新上游合入前端 `dev` 并解决冲突。
- 文件:
  - 新建: None
  - 修改: 7 个已知冲突文件、`src/features/authFiles/uiState.ts` 状态契约文件、fork release policy 保留文件和 merge 自动修改文件
  - 读取: `findings.md`
  - 测试: `git diff --name-only --diff-filter=U`; `rg -n "^<<<<<<<|^=======|^>>>>>>>" <changed files>`
- 依赖: 任务 2
- 验证: 无 unmerged 文件、无 conflict marker、fork 定制路径仍存在；`uiState.ts` 同时保留上游 status filter mode 与 fork `enabledOnly` / `batchCheckConcurrency`。
- 停止条件: text conflict 超出已知 7 个文件且计划未覆盖；`uiState.ts` 状态契约无法小范围合并；任一 `CLAUDE.md` 定制项被移除。

### 任务 4：前端验证与修复

- 目标: 运行前端验证，按失败证据最小修复。
- 文件:
  - 新建: 必要 evidence
  - 修改: 仅限失败根因相关文件
  - 读取: `package.json`; `bun.lock`; 相关 TypeScript/SCSS 文件
  - 测试: dependency gate; `bun run type-check`; `bun run lint`; `bun run build`; fork 定制手工验收
- 依赖: 任务 3
- 验证:
  - dependency gate: 若 `package.json` / `bun.lock` 在 merge 后变化，或依赖安装状态不可确认，先运行 `bun install --frozen-lockfile`；若无法运行，降级并记录风险。
  - command gate: `bun run type-check`; `bun run lint`; `bun run build` exit 0。
  - AuthFiles state gate: 合并后 `src/features/authFiles/uiState.ts` 同时保留 `statusFilterMode`、`isAuthFilesStatusFilterMode`、`enabledOnly`、`batchCheckConcurrency`；旧状态迁移优先级为 `problemOnly -> disabledOnly -> enabledOnly -> all`。
  - UI manual gate: 用 `bun run dev` 进入本地页面，或 build 后用 `bun run preview`，逐项记录 DisplayName、AuthFiles status card、Batch Check、Scoped Poll、ZIP download 的观察结果。Batch Check 必须拆分记录：tiered re-enable modal 是否可见/可操作、翻页或跨页后结果是否仍保留、移动端视口下批量检查和结果入口是否可达；无法用本地非敏感数据覆盖的子项必须标记 `partial` 或 `blocked`。
  - release policy gate: 静态核对 `.github/workflows/release.yml` 只在 `v*` tag 且 job `startsWith(github.ref, 'refs/tags/v')` 时发布；核对 `scripts/version.sh` / `scripts/release-lib.sh` / `release-metadata.env` 的 fork 后缀逻辑仍在；若 `docs/fork-maintainer-workflow.md` 仍存在 master push release 的旧文字，记录为 stale doc follow-up。
- 停止条件: 同一错误族连续失败三次；需要外部服务、真实凭证或生产数据；无本地非敏感后端/测试数据却需要声明 Batch Check / Scoped Poll 行为已验证；release policy 文件被合并删除或 tag guard 被移除。

### 任务 5：收口和后续推进建议

- 目标: 更新 handoff、progress、必要 evidence，给出是否可进入 `master` / release 评估的结论。
- 文件:
  - 新建: `.agents/tasks/20260626-frontend-upstream-v1-17-7/evidence/*`
  - 修改: `handoff.md`; `progress.md`; `ulw-board.md`; `ulw-state.json`
  - 读取: `git status`; validation outputs
  - 测试: 文档核查和工作区状态核对
- 依赖: 任务 4
- 验证: 文档状态与代码状态一致；无未记录验证缺口。
- 停止条件: 用户未授权 push、tag、release 时不得继续外部副作用。

## 执行交接

- 执行路由: ulw_governed
- 为什么使用该路由: 合并具有已知冲突和 UI 回归风险，且用户要求先审核、再代码改动。
- 升级到: `multi_agent` nested review for L02；必要时使用 isolated worktree for L03。
- 交接说明: 子 agent 只读审查；主线程负责最终冲突裁决和业务代码写入。

## 备注

- 本任务必须保留前端 `CLAUDE.md` 中列出的 5 项 fork 定制。
- 旧任务 `20260612-sync-upstream-v7-fork-customizations` 是历史 predecessor，不再作为本任务 authority。
