---
Status: released
Created: 2026-07-03
Owner: Codex
---

# 前端上游 v1.17.8 合并吸收清单任务

## 目标

梳理 `Cli-Proxy-API-Management-Center` 前端从当前 fork 基线到上游 `upstream/main` / `v1.17.8` 的可吸收内容，逐项说明变更、影响模块、作用、冲突和建议解决方案，并在确认后执行候选合并、冲突解决、验证、自评审、提交推送与发版收口。

## 当前执行状态

- 已提交前端上游吸收 commit `69afc30` 到 `dev`。
- 已解决 `src/hooks/useVisualConfig.ts` 与 `src/types/visualConfig.ts` 冲突。
- 已随 Codex 批量额度展示修复一并合入 `master@cbe6d0e`。
- 已推送 `origin/dev`、`origin/master`，并完成发布标签 `v1.17.8-wx-2.9` 发布复核。

## 吸收时基线

- 当前工作分支：`dev`
- 当前 `dev`：`0a44eb2`
- 当前 `master`：`672ef3d`
- 当前 fork 发版标签：`v1.17.7-wx-2.8`
- 当前 `origin/main`：`e9817a8`
- 当前 `upstream/main`：`e9817a8`
- 上游最新版本标签：`v1.17.8`

说明：上述为本任务吸收时的基线。任务完成后上游 `main` 已继续前进，不属于本任务 `v1.17.8` 吸收范围。

## 范围

- 分析上游 `v1.17.7..upstream/main` 的新增前端提交。
- 识别 `dev <- upstream/main` 的机械冲突和行为冲突。
- 明确 fork 自定义功能的保留原则，并提出冲突解决建议。

## 授权边界

- 初始分析阶段不提交、不推送、不发版；后续用户已明确授权提交、推送、合入 `master` 并发版。
- 不覆盖 DisplayName、批量检查增强、范围轮询、多选 zip 下载和 fork CI/Release 定制。

## 验收条件

- 已列出上游新增提交的变更内容、影响模块、作用和合并建议。
- 已说明 `src/hooks/useVisualConfig.ts` 与 `src/types/visualConfig.ts` 的冲突来源和解决原则。
- 吸收提交、`dev`/`master` 推送、发布标签与发布产物均完成复核。
