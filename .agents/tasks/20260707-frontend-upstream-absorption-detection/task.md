---
Status: completed
Created: 2026-07-07
Owner: Codex
---

# 前端上游吸收检测 Dry-Run

## 目标

按后端项目级 `upstream-absorption` skill 的前后端协同规则，对前端仓库执行一轮上游同步吸收检测干跑，确认是否存在新的上游更新、是否需要吸收、是否存在冲突。

## 范围

- 读取前端本地规则。
- 确认前端 `.agents` workspace authority 与工作区状态。
- 执行 fetch 更新远端引用。
- 固定前端 `upstream_target_sha`。
- 生成前端仓库分析、治理方案、上游更新清单、冲突预检和方案自评审报告。
- 向后端汇总前后端检测结论。

## 非目标

- 不执行真实 `git merge`。
- 不解决冲突。
- 不提交、不推送、不合并发布分支。
- 不创建 tag、不触发发布、不部署。
- 不修改既有历史任务治理记录。

## 分支变量

- `upstream_branch`: `main`
- `integration_branch`: `dev`
- `release_branch`: `master`

## 授权边界

- 已授权执行检测干跑 和写入本任务治理记录。
- 候选合并、提交、推送、发布分支合入、标签、发布 和部署均需要再次获得用户明确授权。

## 验收条件

- 已记录 fetch 后的上游目标 SHA。
- 已生成上游更新清单。
- 已完成无写入冲突预检。
- 已说明是否建议进入候选合并，以及需要用户确认的点。
