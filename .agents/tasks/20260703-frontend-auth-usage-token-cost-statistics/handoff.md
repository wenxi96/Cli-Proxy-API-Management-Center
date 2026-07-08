# Handoff

## Current State

本任务处于 released 状态，前端业务代码已提交到 `dev@769b292f`、合入 `master@ca8e8032`，并随发布标签 `v1.17.8-wx-2.10` 发布。当前实现已在使用统计页凭证统计中接入 token 明细、估算金额、价格覆盖状态和单凭证明细弹窗。

## Completed Scope

- 建立前端治理任务目录。
- 完成需求分析、当前实现发现、前端展示设计和实施计划草案。
- 明确旧后端兼容策略和金额估算边界。
- 完成第 1 轮 token total 口径修复和第 2/3 轮前后端契约复核。
- 同步 `auth_index` opaque string、service URL encoding 和本地降级 total-token normalization 约束。
- 根据 Codex 子代理评审补充估算金额价格覆盖状态：`complete`、`partial`、`unconfigured`，并要求记录缺失价格模型列表。
- 补充混合已配置价格模型和未配置价格模型的验收与验证要求，避免把低估金额展示为完整金额。
- 实现 `usageApi.getAuthUsageRequests`、凭证 usage 聚合 helper、凭证统计表 token/金额列、单凭证明细弹窗和本地降级路径。
- 补齐简体中文、繁体中文、英文、俄文文案以及宽表格 / 弹窗样式。
- 时间范围过滤后的 usage 会移除顶层 `auths`，避免局部时间窗口误用全局后端认证文件聚合。
- 完成 `dev`/`master` 推送、发布标签 `v1.17.8-wx-2.10` 发布和 GitHub Release 资产核验。

## Verification

- 规划阶段治理审计：前端仓库 `project-agents-audit` clean；前端任务 `standard-doc-audit` clean；Codex focused rereview `verdict: ready`, `Findings: None`。
- `npm run type-check`: passed。
- `npm run lint`: passed。
- `npm run build`: passed。
- `git diff --check`: clean。
- `git status --short -- dist src package-lock.json package.json`: `dist` 无变更；仅本任务源码文件处于修改 / 未跟踪状态。
- `bun run type-check` / `bun run build`: 当前环境未安装 `bun`，未能执行；已用 `npm` 脚本完成验证。
- `python3 /home/cheng/.agent-workstation/bootstrap/bootstrap.py standard-doc-audit --task /home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260703-frontend-auth-usage-token-cost-statistics --json`: clean。
- `python3 /home/cheng/.agent-workstation/bootstrap/bootstrap.py edit-batch-review-audit --report /home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260703-frontend-auth-usage-token-cost-statistics/reviews/2026-07-03-implementation-edit-batch-review.md --json`: clean。
- `python3 /home/cheng/.agent-workstation/bootstrap/bootstrap.py project-agents-audit --repo /home/cheng/git-project/Cli-Proxy-API-Management-Center --json`: clean。
- `git ls-remote --tags origin v1.17.8-wx-2.10`: tag points to `ca8e8032213711902835fdeefc1bcb926984410c`.
- GitHub Actions `Build and Release` run `28651472017`: completed/success。
- GitHub Release `v1.17.8-wx-2.10`: `management.html` uploaded。
- Direct download check for `management.html`: HTTP 200。

## Remaining Work

- 前端发布收口无剩余工作。
- 当前仓库仍存在本任务外历史 `.agents` 脏改；本任务发布收口不依赖这些文件。
