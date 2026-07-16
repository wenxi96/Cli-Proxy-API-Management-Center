# 前端上游吸收治理方案

## 目标

将固定上游目标 `d3df9b07` / `v1.18.3` 形成可审查、可验证、可回滚的吸收候选，并保护 fork 定制。

## 范围

- 仓库分析、38 个上游提交的更新清单、冲突预检、方案评审。
- 用户确认后的隔离候选 merge、冲突解决、验证与多轮评审。
- 经授权的 dev/master 分支推进和可选发布。

## 非目标

- 不吸收目标 SHA 之后的新提交。
- 不在 L01 修改业务代码、安装依赖或产生外部副作用。

## 分支/发版策略

- upstream_branch: `main`
- integration_branch: `dev`
- release_branch: `master`
- upstream mirror: 当前 `origin/main@fd22c148` 是固定目标祖先，落后 `d3df9b07` 21 个提交。候选合并前在单独授权点 fast-forward `origin/main` 到固定目标，并核验 `origin/main == upstream/main == upstream_target_sha`；不能 fast-forward 或目标漂移则停止。
- release candidate gate: master 当前树无 `.agents`，且 master candidate 通过测试、type-check、lint、build、diff 与冲突扫描。
- tag / release 触发条件: 用户明确授权、版本脚本在实际 master candidate 上计算、tag 指向已验证 SHA。
- 分支策略例外及理由: 本地被 `.gitignore` 忽略的 `CLAUDE.md` 保留历史“直接合并 master”说明，但用户直接规则、已跟踪 `.agents/README.md` 和项目级 skill 均要求代码先进入 `dev`、再合入 `master`；本任务明确以后者为权威。`CLAUDE.md` 引用的 `docs/upstream-sync-plan.md` 不存在，不作为 skip 来源。

## 规则权威与显式 Skip

- 已跟踪仓库规则: `.agents/README.md` 的 `dev -> master` 和 `.agents only dev` 规则。
- 本地 advisory: `CLAUDE.md` 未被 Git 跟踪，仅用于识别 fork 功能保护点；其中旧分支路由和失效文档引用被本任务显式替代。
- 上游新增 `AGENTS.md`: 不吸收，避免形成新的平行规则源；这是本轮唯一显式 skip，必须由用户在 L02 前确认。
- 候选 allowlist gate: `AGENTS.md` 必须不在 index/candidate 中；`4af4cf4` 的 `.github/workflows/ci.yml`、tests、package scripts 和 README 变化必须存在。

## 授权边界

- 允许: fetch、分析、治理文档、只读预检与方案评审。
- 需要再次确认: 候选 merge；显式 skip 上游 `AGENTS.md`；依赖安装；任何 commit/push/master/tag/release/deploy。
- 禁止: 强推、历史改写、删除 fork 定制或把 `.agents` 带入 master。

## 任务拆分

- 前端仓库任务: 当前任务。
- 后端仓库任务: `20260715-backend-upstream-v7-2-77-absorption`。
- 共享确认点: 两仓库清单与冲突评审均闭环后统一确认。
- 不纳入本轮的改动: 目标 SHA 之后的新上游提交、无关功能开发。
- 跨仓库证据落点: 各仓库独立 `evidence/`，最终仅汇总结论。

## 阶段拆分

1. 仓库分析与目标固定。
2. 更新清单和冲突预检。
3. 独立方案评审与复评。
4. 用户确认 checkpoint。
5. 重新 fetch、核验目标未漂移，并经授权 fast-forward `origin/main` 镜像。
6. 隔离候选合并和冲突解决。
7. 聚焦/全量验证、浏览器 QA 与多轮代码评审。
8. 经授权的提交、master 与发版。

## 评审策略

- 跨仓库且跨 minor 版本，L01 必须独立只读评审。
- finding 使用 `fixed | accepted_risk | not_applicable | blocked`。
- 最后一轮无新增 finding、无未处理 medium 及以上问题才允许进入确认 checkpoint。

## 停止条件

- 上游目标漂移、fork 定制保护点不清、验证环境不可用、评审发现阻断问题或外部副作用未授权。

## 验证策略

- 依赖门禁: 使用仓库声明的 Bun 1.3.14；语义合并 package 后重建 bun.lock，再执行 frozen install，禁止手工拼 lock。
- 聚焦验证: 按下方 risk-to-proof 矩阵运行；`test:usage` 保留为 fork usage v2 专项门禁。
- 全量验证: `bun run test` 运行上游新增 16 个测试及 fork 测试；随后执行 `bun run verify`、`bun run test:usage`、`bun run type-check`、`git diff --check` 与冲突标记扫描。
- 浏览器 QA: 使用真实构建/开发服务验证 provider、Auth Files、Visual Config、Usage 页面；静态检查不得替代页面行为验证。
- 发布后验证: refs、Actions、Release `management.html` 与直接下载。

## Risk-to-proof 矩阵

| 风险切片 | 必保行为 | 验证与通过标准 |
|---|---|---|
| Provider/API Key/DisplayName | 单 Key、多 Key的 existing key reveal；未编辑保存不覆盖；编辑/清空/删除；DisplayName create/edit/clear；并发保留未触碰字段 | `bun run test` 中 provider concurrency 测试；新增 API Key editor 单元测试；浏览器验证单/多 Key 和 DisplayName 全状态 |
| xAI/Codex quota | xAI weekly/product/on-demand/monthly；Codex 月度不误标五小时、空 weekly 不渲染、primary/secondary parity；cache 按 connection 隔离 | quota fixtures、quotaSessionIsolation、batch A/B parity Bun 回归；同一文件单刷/批量页面对照 |
| Visual Config/Scoped Poll | latest snapshot 并发更新；scoped defaults/providers、threshold、unknown fields、Redis range、image passthrough round-trip | visualConfigConcurrency/Validation/DisableImageGeneration + fork scoped YAML round-trip；浏览器验证开关、策略和 AuthFileCard badge |
| Auth Files/ZIP/Official API | alias、excluded rules、unsaved edits、official API、batch state；ZIP 跨页选择、去重、Content-Disposition、失败反馈、mobile 可达 | 上游 OAuth/auth tests + fork batch/ZIP tests；桌面和移动 viewport 浏览器 smoke |
| Usage v2 | 原有统计、token/cost 明细、路由入口、Chart.js 和凭证详情弹窗 | `bun run test:usage`；使用代表性 v2 fixture 浏览器验证 `/usage` 导航、图表和详情弹窗 |
| Plugin/Provider | official source identity、version selection、untouched config、sponsor 聚合恢复、新 provider | 上游 plugin/provider tests 全部通过；插件页/provider workbench smoke |
| i18n/cleanup | 四语言仍引用 key 不丢，fork-only exports/styles 不被误删 | JSON parse、locale key 引用扫描、type-check、lint、build |
| Toolchain/release | package/lock 一致、CI test gate、v* tag-only、单文件资产 | frozen install、`bun run verify`、workflow 静态断言、实际 master candidate build |

## Dev 到 Master 候选构造

1. 固定通过全量验证和浏览器 QA 的 `dev_candidate_sha`。
2. 在独立 master worktree 中执行 `master <- dev_candidate_sha` 的 no-ff 候选合并。
3. 提交前从候选 index 删除 `.agents`，执行 `git ls-files --stage -- .agents`，输出必须为空；该检查针对待提交 index，而不是旧 `HEAD`。
4. 提交后固定 `master_candidate_sha`，执行 `git ls-tree -r --name-only "$master_candidate_sha" -- .agents`，输出必须为空。
5. 执行 `git diff --exit-code dev_candidate_sha..master_candidate_sha -- . ':(exclude).agents'`，证明业务树等价。
6. 在实际 master candidate 上重跑 build、diff/conflict scan、版本/asset 规则和 release workflow 静态门禁；tag 只能指向该 SHA。
