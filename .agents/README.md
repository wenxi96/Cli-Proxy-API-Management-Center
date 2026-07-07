# .agents 工作区

Persistence Mode: git-visible

本目录用于保存当前仓库的持久化任务上下文、仓库治理记录和可复用仓库索引。

## 规范工作区

- 规范 `.agents` 路径：`.agents/`
- 当前执行面：主工作树
- 当前活跃任务入口：`tasks/20260707-frontend-upstream-v1-17-10-absorption/task.md`

## 当前活跃任务

- `tasks/20260703-codex-batch-quota-display-parity/`：修复 Codex 批量检查卡片的额度展示逻辑，使 B 路 Codex 展示复用单文件刷新 A 路的 `CodexQuotaState` 适配器；已提交到 `dev@75a4d64`、合入 `master@cbe6d0e`，并随 `v1.17.8-wx-2.9` 发布。
- `tasks/20260703-frontend-upstream-v1-17-8-absorption/`：前端独立吸收 `upstream/main@e9817a8` / `v1.17.8`；已提交到 `dev@69afc30`、合入 `master@cbe6d0e`，并随 `v1.17.8-wx-2.9` 发布。
- `tasks/20260707-frontend-upstream-absorption-detection/`：调用项目级 `upstream-absorption` skill 执行前端上游吸收检测干跑，固定上游目标、生成更新清单并完成冲突预检。
- `tasks/20260707-frontend-upstream-v1-17-10-absorption/`：前端独立吸收 `upstream/main@4064b01` / `v1.17.10`；已提交到 `dev@cfabc797`、合入 `master@6bf3d12`，并随 `v1.17.10-wx-2.10` 发布。
- `tasks/20260703-frontend-auth-usage-token-cost-statistics/`：规划使用统计页凭证统计增加 token breakdown、估算金额和单凭证明细弹窗。
- `tasks/20260629-auth-file-quota-display-unification/`：direct_inline 任务，统一认证文件「单文件刷新额度」与「批量检查概览卡片」两处入口的额度展示（渲染层统一、A 对齐 B、provider 特有信息保留）；计划已落地，待批准进入实现。
- `tasks/20260626-frontend-upstream-v1-17-7/`：前端独立吸收 `upstream/main@acf432b` / `v1.17.7`，保留 fork 定制能力；已提交到 `dev@1ff3f56`、合入 `master@8f9eda1`，并随 `v1.17.7-wx-2.7` 发布。
- `tasks/20260612-sync-upstream-v7-fork-customizations/`：历史参考任务，上一轮跨仓库上游同步计划的前端侧记录。
- `tasks/20260527-sync-upstream/`：历史前置任务，已被 2026-06-12 跨仓库任务取代，不再作为执行权威。

## 仓库索引

- `registry/repo-overview.md`：仓库范围、入口和关键事实。
- `registry/repo-map.md`：重要路径结构图。
- `registry/execution-surface.md`：可运行命令与执行面说明。
- `registry/verification-commands.md`：验证命令分层。
- `registry/index-manifest.json`：机器可读索引新鲜度和覆盖范围。

## 目录职责

- `registry/`：稳定仓库上下文与索引。
- `tasks/`：需要持久状态的活跃任务目录。
- `workers/`：worker 本地草稿，默认可丢弃。
- `reports/`：仓库级审计或评审报告。
- `scratch/`：临时输出，默认可清理。
- `archive/`：已完成或已失效任务归档。

## 本地约定

- 仓库专属规则当前记录在 `CLAUDE.md`；该文件被 `.gitignore` 忽略，需要随仓库移交的稳定规则应同步到已跟踪治理文档。
- 上游同步时必须保留 `CLAUDE.md` 中列出的 fork 定制能力。
- `.agents/` 治理记录只在 `dev` 集成分支维护；`master` 稳定发布分支当前树必须保持不包含 `.agents`。
- 不在 `.agents/` 中存放密钥、管理 key、token、cookie 或原始私密配置。
