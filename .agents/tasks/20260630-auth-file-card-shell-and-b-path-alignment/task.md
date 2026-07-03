# 认证文件卡片外壳统一 + B 路径 labelKey 映射

## 任务摘要

单文件刷新额度区加卡片外壳（标题「额度概览」+ 右侧标签 + 刷新时间），与批量检查外壳结构统一；批量检查的额度行标签经 labelKey 映射后与单文件刷新一致（中文翻译）；移除「当前可用」字段。基于上一任务 `20260629-auth-file-quota-display-unification` 已统一的 QuotaRowsView 渲染层。

## 范围

- 做：抽共享外壳组件 `QuotaCardShell`；单文件刷新区接入外壳；B 路径 `batchResultToQuotaView` 加 labelKey 映射（codex WINDOW_META + claude CLAUDE_USAGE_WINDOW_KEYS）；移除「当前可用」。
- 不做：不改数据获取层/store/后端接口；resetCredits 等后端未返回的特有信息记为缺口；不处理 antigravity/kimi/xai 的 B 路径 labelKey（待后续 HAR 验证）；不改 QuotaRowsView 渲染逻辑。

## 验收条件

- `bun run type-check` / `lint` / `build` 全 exit 0。
- 单文件刷新显示「额度概览」外壳 + 标签 + 刷新时间；批量检查「当前可用」已移除；codex 两入口的 window 标签一致（中文）。

## 状态指针

- Canonical Plan Path: `plans/2026-06-30-card-shell-and-b-labelkey-plan.md`
- Live Status Authority: `progress.md`
- Execution Mode: direct_inline
- Status: in_progress
