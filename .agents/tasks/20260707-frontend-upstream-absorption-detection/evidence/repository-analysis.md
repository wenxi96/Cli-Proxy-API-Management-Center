# 前端仓库分析报告

## 本地规则

- 入口规则：本轮由后端项目级 `upstream-absorption` skill 扩展为前后端同步检测；前端仓库无同名项目级 skill，已读取本地 `CLAUDE.md`、README、package scripts 和 `.agents/README.md`。
- 验证命令：`bun install --frozen-lockfile`、`bun run lint`、`bun run type-check`、`bun run build`。
- 禁止/限制项：不真实合并、不提交、不推送、不合并发布分支、不创建 tag、不触发发布、不覆盖既有历史 `.agents` 改动。

## 分支与远端

- 当前分支：`dev`
- origin：`https://github.com/wenxi96/Cli-Proxy-API-Management-Center.git`
- upstream：`https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git`
- integration_branch：`dev`
- release_branch：`master`
- upstream_branch：`main`
- upstream target SHA：`4064b01ac3a67be825495a1da8adf7534790d755`
- upstream 最新 tag：`v1.17.10`
- fork 最新 tag：`v1.17.8-wx-2.10`

## 发布链路

- 前端发布工作流：tag 触发正式发布，产物为单文件 `management.html`。
- 发版前必须核验：`bun run lint`、`bun run type-check`、`bun run build`、发布工作流、发布资产。
- 本轮不进入发版。

## Fork 定制保护点

| 能力 | 文件/符号 | 风险 | 验证 |
|---|---|---|---|
| DisplayName | `src/features/providers/adapters.ts`; `BaseProviderForm.tsx`; provider cards | 与上游 ClaudeAPI / Code0 provider 增强触碰同一文件并已冲突 | 真实合并后验证 provider 编辑页和卡片展示 |
| Auth Files Batch Check 增强 | `src/features/auth-files/*` | 本轮上游未直接触碰，仍需回归检查 | 真实合并后跑构建并手动回归关键页面 |
| Scoped Poll | Visual config / auth card badge | 本轮上游未直接触碰，仍需保护 | 真实合并后检查配置页和认证卡片 |
| 多选压缩下载 | auth files 下载相关 | 本轮上游未直接触碰，仍需保护 | 真实合并后检查按钮和调用 |
| CI/Release | `.github/workflows/*` | 本轮上游未直接触碰，仍需保留 fork 后缀规则 | 发布门禁 |
| 凭证 token / 金额统计规划 | `.agents/tasks/20260703-frontend-auth-usage-token-cost-statistics/` | 当前仓库已有未提交治理记录，本轮不覆盖 | 保持隔离 |

## 当前工作区

- 脏改：开始检测前已有多项历史 `.agents` 治理记录改动；本轮不整理、不覆盖。
- 本轮改动：仅新增 `.agents/tasks/20260707-frontend-upstream-absorption-detection/`。
- 无关 ignored：`.claude/`、`.env.local`、`CLAUDE.md`、`dist/` 为 ignored 或本地文件，不纳入本轮。
- 是否需要隔离 worktree：若进入真实候选合并，建议使用隔离 worktree 或先收口当前前端 `.agents` 历史改动，避免治理记录混杂。
