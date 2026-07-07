# 前端上游吸收治理方案

## 目标

对前端仓库执行上游吸收检测干跑，确认 `upstream/main` 是否存在新内容、增量范围、冲突文件和真实吸收前确认项。

## 范围

- fetch 前端远端。
- 固定 `upstream/main` 目标 SHA。
- 生成更新清单和冲突预检。
- 输出前端检测结论并参与前后端总汇总。

## 非目标

- 不执行真实 merge。
- 不修改业务代码。
- 不整理既有历史 `.agents` 改动。
- 不提交、不推送、不发版。

## 分支/发版策略

- upstream_branch：`main`
- integration_branch：`dev`
- release_branch：`master`
- 发布候选 gate：本轮不进入。
- 标签 / 发布 触发条件：本轮不触发。
- 分支策略例外及理由：无。本轮仅检测。

## 授权边界

- 允许：fetch、只读 Git 分析、无写入 merge-tree、写入本任务治理记录。
- 需要再次确认：真实候选合并、冲突解决、提交、推送、合入 `master`、标签、发布。
- 禁止：覆盖历史 `.agents` 改动或混入 ignored 本机文件。

## 任务拆分

- 后端仓库任务：`CLIProxyAPI/.agents/tasks/20260707-upstream-absorption-detection/`
- 前端仓库任务：`.agents/tasks/20260707-frontend-upstream-absorption-detection/`
- 共享确认点：前后端是否一起进入真实候选合并。
- 不纳入本轮的改动：真实 merge、业务修复、发布。
- 跨仓库证据落点：最终汇总回后端任务。

## 评审策略

- 方案评审触发条件：发现冲突、触碰 fork 定制能力、工作区已有脏改。
- 独立评审触发条件：进入真实合并并解决 provider adapter / form 冲突时。
- 退出门禁：检测报告完整；冲突和确认项已列明；未执行外部副作用。

## 验证策略

- 聚焦验证：provider workbench、ClaudeAPI / Code0 / ApiKeyFun sponsor provider、DisplayName、quota progress。
- 全量验证：`bun run lint`、`bun run type-check`、`bun run build`。
- 发布后验证：发布工作流和 `management.html` 资产。
