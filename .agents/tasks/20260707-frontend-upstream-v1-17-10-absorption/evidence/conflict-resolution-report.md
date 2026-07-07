# 前端冲突解决报告

## 候选合并

- Worktree：`~/.agents/worktrees/wenxi96/Cli-Proxy-API-Management-Center/upstream-v1-17-10-absorption`
- Candidate branch：`codex/frontend-upstream-v1-17-10-absorption`
- Base：`dev@769b292fd4ed491ad2e8b11e9537323c9c3c8dda`
- Upstream target：`4064b01ac3a67be825495a1da8adf7534790d755`
- Merge command：`git merge --no-commit --no-ff 4064b01ac3a67be825495a1da8adf7534790d755`

## 冲突文件

- `src/features/providers/adapters.ts`
- `src/features/providers/sheets/forms/BaseProviderForm.tsx`

## 解决原则

- 保留 fork DisplayName 定制：resource `displayName`、表单 `displayName` 字段、保存时 `displayName` 写回配置。
- 保留 fork `fallbackIdentifier` 逻辑：非 sponsor provider 仍优先使用 prefix，再使用 masked API key。
- 吸收上游 provider 能力：ClaudeAPI provider、Code0 sponsor provider、Sponsor Gemini 通道、Claude-like brand 行为、ClaudeAPI 默认 base URL。

## 实际处理

- `adapters.ts`：
  - 保留 `providerKeyToResource` 的 `displayName` 和 `fallbackIdentifier`。
  - 保留上游 `claudeApiToResource`、`code0ToResource`、`SponsorProviderBrand` 泛化。
  - sponsor resource 使用 `options.displayName`，并补齐 fork 需要的 `displayName: options.displayName`。
- `BaseProviderForm.tsx`：
  - 创建模式保留 `displayName: ''`。
  - 创建 ClaudeAPI 时使用 `CLAUDE_API_BASE_URL` 默认 base URL。
  - 使用 `isClaudeLikeBrand` 统一 Claude / ClaudeAPI 的 cloak、CCH signing、test model、disable cooling 行为。

## 结论

- 已解决所有前端机械冲突。
- 当前无冲突标记。
