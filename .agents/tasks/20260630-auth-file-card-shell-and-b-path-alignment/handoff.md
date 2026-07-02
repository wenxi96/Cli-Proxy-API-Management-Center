# Handoff — 卡片外壳统一 + B 路径 labelKey 映射

## Current State

任务启动，T1-T4 待实现。基于上一任务 `20260629` 已统一的 QuotaRowsView + quotaView.tsx。

## Remaining Work

- T1: QuotaCardShell + 批量检查接入 + 移除「当前可用」
- T2: 单文件刷新区接入外壳
- T3: B 路径 labelKey 映射（codex + claude）
- T4: i18n + 人工验证

## 接手要点

- 代码基线 dev@d8b3dd4（含上一任务改动）。
- 后端 batch-check 不返回 resetCredits —— 记为缺口。
- B 路径 window.id（five-hour/weekly）与 A 路径 WINDOW_META.id 一致，可做前端映射。
