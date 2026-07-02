# 卡片外壳统一 + B 路径 labelKey 映射 实施计划

（详见 task.md，plan 内容与已批准的 ExitPlanMode 一致）

## 任务拆分

### T1: 抽共享外壳组件 QuotaCardShell + 批量检查接入
- 新建 `src/features/authFiles/components/QuotaCardShell.tsx`，Props: `{ title; badges?; meta?; children; className? }`，复用现有样式类。
- `AuthFileCard.tsx` 批量检查外壳（:389-433）改为 `<QuotaCardShell>`，移除「当前可用」（:415-418）。

### T2: 单文件刷新区接入外壳
- `AuthFileCard.tsx:435` 的 AuthFileQuotaSection 外包 `<QuotaCardShell title="额度概览">`。
- 计算单文件 badges（额度情况）+ meta（刷新时间）。

### T3: B 路径 labelKey 映射
- quotaConfigs.ts 把 WINDOW_META 提到模块级 export。
- quotaView.tsx 加 resolveBatchWindowLabel(provider, window)：codex/claude 查映射表，未命中透传。

### T4: i18n + 人工验证
- 新增 i18n key；浏览器对比 codex 两入口。
