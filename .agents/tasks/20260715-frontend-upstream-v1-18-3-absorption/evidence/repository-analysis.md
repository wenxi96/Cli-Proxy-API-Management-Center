# 前端仓库分析报告

## 本地规则

- 入口规则: 用户直接规则、已跟踪 `.agents/README.md` 与后端 canonical upstream-absorption skill 的前后端协同规则。`CLAUDE.md` 被 `.gitignore` 忽略且未跟踪，仅用于识别 fork 功能保护点；其 master-first 旧说明和不存在的 `docs/upstream-sync-plan.md` 引用不作为本轮执行权威。
- 验证命令: `bun run test`、`bun run verify`、`test:usage`、type-check；依赖变化时 frozen install；diff/conflict scan；provider/Auth Files/Visual Config/Usage 浏览器 QA。
- 禁止/限制项: `.agents` 只进入 `dev`；`master` 当前树无 `.agents`；保留 DisplayName、批量检查、scoped poll、ZIP、tag-only release、API Key 回显与 usage v2。

## 分支与远端

- 当前分支: `dev@878b4d75ed832fd61cb9b87c4a05722733937ed8`
- origin: `wenxi96/Cli-Proxy-API-Management-Center`
- upstream: `router-for-me/Cli-Proxy-API-Management-Center`
- origin main mirror: `origin/main@fd22c148` 是固定目标祖先，落后 `d3df9b07` 21 个提交，可 fast-forward；本地 `CLAUDE.md` 要求同步前对齐，推送需用户授权。
- 集成分支: `dev`
- 发布分支: `master@41d8d6d02c9509df8e369ee596e5a04647707dfd`
- 上游主分支: `main`
- 上游目标 SHA: `d3df9b074ecc8c1161d998d65e09948bcbcaa6ef` / `v1.18.3`
- merge base: `4064b01ac3a67be825495a1da8adf7534790d755` / `v1.17.10`
- 分叉: fork 独有 82 commits，上游新增 38 commits；上游变更 141 files、+4,766/-4,450。
- release topology: `master...dev = 11/9`；当前两分支非 `.agents` 业务树等价。后续需固定 dev/master candidate SHA，并重新证明非 `.agents` 树等价。

## Release 链路

- 版本脚本: `scripts/version.sh auto-release`，实际 master candidate 上计算。
- GitHub Actions: `.github/workflows/release.yml` 仅由 `v*` tag 正式发布。
- Release 资产: single-file `management.html`。
- 发版前必须核验: master 无 `.agents`、frozen dependency gate、type-check/lint/build/tests、fork 定制、Actions 与资产下载。

## Fork 定制保护点

| 能力 | 文件/符号 | 风险 | 验证 |
|---|---|---|---|
| Provider DisplayName 与 API Key 回显 | provider forms/adapters/types、`BaseProviderForm.tsx`、新增 `ApiKeyEntriesEditor.tsx`、icons/i18n | 上游折叠 API key/model 表单和 dead-code cleanup 可能删除入口或让多 Key existing value 为空 | 单/多 Key create/edit/clear/delete、DisplayName 并发保存、页面 QA |
| Auth Files batch check 与额度展示 | authFiles API/features、`quotaView.tsx`、quota configs | 上游 official API、xAI 新额度和 Codex window 简化可能改变 A/B 路展示 | xAI 全窗口 fixtures、Codex batch parity 持久测试、页面 QA |
| Scoped Poll / visual config | `useVisualConfig.ts`; config store/types/API | 上游并发更新和字段清理可能覆盖 fork scoped-pool 字段 | config round-trip、并发写、visual editor 静态断言 |
| ZIP 下载与跨页批量状态 | authFiles hooks/store/page | 上游 dead-code cleanup 可能误删 fork-only 调用 | archive endpoint/file name 与状态持久测试 |
| Usage v2 | `src/components/usage/**`; `src/utils/usage*`; i18n; `package.json` | 上游依赖与测试脚本变更可能覆盖价格、normalization 和 test script | 52 usage tests、type-check/build、i18n key scan |
| Tag-only release 与 fork 版本 | workflow、scripts、metadata | 上游清理可能恢复不同触发或版本行为 | workflow/version script 静态检查 |

## 当前工作区

- 脏改: 仅当前新任务 `.agents` 治理文件；业务代码无修改。
- 无关改动处理: 无无关脏改，不覆盖历史任务。
- 是否需要隔离 worktree: 是。L02 merge、依赖解析和业务修复必须在 linked worktree 中完成。
