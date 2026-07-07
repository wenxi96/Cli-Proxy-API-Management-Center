# Findings

## 已确认事实

- 本任务是前端真实上游吸收执行任务，不复用已完成的检测干跑 任务。
- 检测干跑 已确认前端 `upstream/main` 目标为 `4064b01ac3a67be825495a1da8adf7534790d755`，最新 tag 为 `v1.17.10`。
- 检测干跑 已确认 `dev` / `master` 对上游目标均会在 `src/features/providers/adapters.ts` 与 `src/features/providers/sheets/forms/BaseProviderForm.tsx` 出现内容冲突。
- 当前前端主工作树检出 `dev`，且有多项历史 `.agents` 治理记录改动；真实合并必须在隔离 worktree 中进行。
- 前端仓库未初始化 CodeGraph；本轮使用本地 `rg` 和文件读取确认冲突区域。

## 待确认 / 待关闭

- 候选合并后 DisplayName / fallbackIdentifier 是否在通用 provider、Sponsor provider、ClaudeAPI、Code0 资源中保持一致。
- BaseProviderForm 是否同时保留 DisplayName 字段和上游 ClaudeAPI 默认 base URL / Claude-like brand 行为。
- 验证通过后实际提交、推送和发版核验是否能一次通过。
