# Progress — 卡片外壳统一 + B 路径 labelKey 映射

## 2026-06-30 任务启动

- Action: 上一任务（额度行渲染层统一）收口后，用户浏览器反馈两入口仍有不一致（单文件无外壳、批量检查 label 未对齐）。经调研（卡片外壳结构 + A/B labelKey 机制 + HAR 实证后端 window.id）确认可行性，plan 已批准。
- Files: 任务目录骨架（task.md/findings.md/progress.md/plans/）。
- Verification: 调研阶段（3 个 Explore agent + HAR 分析），未跑构建。
- Result: 任务启动，T1-T4 待实现。
- Next: T1 实现（QuotaCardShell + 批量检查接入）。

## 2026-06-30 T1-T4 实现 + 静态自检

- Action: 按批准 plan 实现 T1-T4（外壳组件 + 单文件接入 + B 路径 labelKey + i18n）。
- Files:
  - 新建 `src/features/authFiles/components/QuotaCardShell.tsx`（共享外壳组件）。
  - 改 `AuthFileCard.tsx`：批量检查外壳改用 QuotaCardShell + 移除「当前可用」。
  - 改 `AuthFileQuotaSection.tsx`：内部用 QuotaCardShell 包裹（标题「额度概览」+ 状态标签 success/error/loading）。
  - 改 `quotaConfigs.ts`：WINDOW_META + 时长常量提到模块级 export（CODEX_WINDOW_META 等）。
  - 改 `quotaView.tsx`：新增 resolveBatchWindowLabel（codex/claude 查映射表）+ resolveWindowLabel 加 provider/t 参数。
  - 改 i18n：zh-CN/en/zh-TW/ru 各加 4 个 key（quota_overview_title/quota_status_*）。
- Verification: 静态自检全部通过——QuotaCardShell 两处引用、CLAUDE_USAGE_WINDOW_KEYS/CODEX_WINDOW_META 引用 4 处、4 个新 i18n key 存在、batchCheckCheckedAt 仍用（检查时间保留）、DOM 等价性（批量检查外壳结构与改造前一致，仅移除当前可用）。环境无 bun/tsc，未跑 type-check/lint/build。
- Result:
  1. **T1**：QuotaCardShell 建好，批量检查外壳接入，移除「当前可用」（保留检查时间）。DOM 等价。
  2. **T2**：单文件刷新区接入外壳——标题「额度概览」+ 状态标签（success→可用/绿色、error→异常/红色、loading→加载中/灰色、idle→无标签）。无刷新时间（用户决策，quota state 无该字段）。
  3. **T3**：B 路径 labelKey 映射——resolveBatchWindowLabel 用 result.provider + window.id 查 CODEX_WINDOW_META（codex）/ CLAUDE_USAGE_WINDOW_KEYS（claude），命中翻译成中文，未命中透传 window.label。antigravity/kimi/xai 暂透传（待 HAR 验证）。
  4. **T4**：4 语言 i18n key 补齐。
- **验证缺口**：type-check/lint/build 未跑（环境无 bun）；浏览器人工双入口对比待做（dev 服务在 localhost:5173 运行中）。
- Next: 浏览器人工验证（codex 两入口：批量检查 window 标签是否变中文 + 单文件是否有额度概览外壳 + 当前可用是否移除）。
