# 前端冲突预检报告

## 预检命令

- 命令：`git merge-tree --write-tree dev upstream/main`
- 目标分支：`dev@769b292fd4ed491ad2e8b11e9537323c9c3c8dda`
- 上游目标：`upstream/main@4064b01ac3a67be825495a1da8adf7534790d755`
- 退出码：`1`

补充检查：

- 命令：`git merge-tree --write-tree master upstream/main`
- 目标分支：`master@ca8e8032213711902835fdeefc1bcb926984410c`
- 退出码：`1`
- 结论：release_branch 也会遇到相同冲突文件。

## 机械冲突

- 结论：存在 2 个明确内容冲突。
- 文件：
  - `src/features/providers/adapters.ts`
  - `src/features/providers/sheets/forms/BaseProviderForm.tsx`
- 建议：
  - 真实合并时在隔离 worktree 中处理。
  - `adapters.ts` 需要同时保留 fork 的 `displayName` / `fallbackIdentifier` 定制，以及上游 ClaudeAPI / Code0 / Gemini sponsor provider 泛化逻辑。
  - `BaseProviderForm.tsx` 需要同时保留 fork 的 DisplayName 字段与上游 ClaudeAPI 默认 base URL、Claude-like brand 行为。

## 行为冲突风险

### DisplayName vs ClaudeAPI / Code0 provider

- 风险说明：fork 定制让凭证 displayName 进入 resource 和表单；上游新增 ClaudeAPI/Code0 provider 也修改同一 adapter 和 base form。
- 证据：
  - fork 侧在 `providerKeyToResource` 中新增 `displayName` 与 `fallbackIdentifier`。
  - 上游侧将 provider brand 扩展到 `claudeApi`，抽象 `sponsorRawToResource` 并加入 `code0ToResource`。
  - fork 侧在 `BaseProviderForm` 新增 `displayName` 表单字段；上游侧新增 `CLAUDE_API_BASE_URL` 和 `isClaudeLikeBrand`。
- 建议解决：
  - 合并 provider resource 字段时保留 `displayName`，并让 `claudeApi` 也走同一 resource 生成路径。
  - 合并 sponsor 抽象时补齐 `displayName` 字段，避免类型或 UI 展示回退。
  - 合并表单初始值时保留 `displayName`，同时让 `claudeApi` 使用默认 base URL 与 Claude-like cloak / cch signing 行为。

### Quota progress 与认证文件额度展示

- 风险说明：上游移除无效 limit amount 展示并新增 xAI pay-as-you-go quota progress，可能影响 fork 已修复的批量认证文件额度展示逻辑。
- 证据：上游触碰 `src/components/quota/quotaConfigs.ts`、`src/types/quota.ts`、i18n。
- 建议解决：真实合并后同时回归批量检查概览卡片、单文件刷新卡片和 xAI/Grok quota progress。

## 合并建议

- 建议是否进入候选合并：可以，但必须先由用户确认；建议隔离 worktree。
- 需要用户确认的点：
  - 是否先收口当前前端已有 `.agents` 历史治理改动，避免提交混杂。
  - 是否接受本轮吸收上游 `v1.17.10`，包括 ClaudeAPI / Code0 provider 与 xAI pay-as-you-go quota progress。
  - 是否同意将 provider adapter / form 冲突解决作为前端重点评审对象。
