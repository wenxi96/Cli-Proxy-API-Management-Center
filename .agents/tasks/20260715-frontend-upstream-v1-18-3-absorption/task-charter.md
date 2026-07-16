# T01 前端吸收上游 v1.18.3

## 任务摘要

检测、评审并安全吸收前端 `upstream/main@d3df9b074ecc8c1161d998d65e09948bcbcaa6ef` / `v1.18.3`，保留 fork 自定义能力，并按 `dev -> master -> tag/release` 规则分阶段推进。

## 成功定义

- 仓库分析、38 个上游提交的分组清单、冲突预检和治理方案已落地并通过独立评审。
- 用户确认吸收清单后，在隔离执行面完成候选合并、冲突解决、多轮代码评审和前端验证。
- 获得对应外部副作用授权后，代码提交推送到 `dev`，仅代码进入 `master`；如执行发版，则 tag、Actions 与 `management.html` 均完成核验。

## 非目标

- 不在本任务维护后端 authority；后端使用独立任务 `20260715-backend-upstream-v7-2-77-absorption`。
- 不顺带吸收评审目标 SHA 之后的新提交。
- 不在 L01 修改前端业务代码、合并上游、安装依赖、提交、推送、打 tag 或发版。
- 不删除 fork 定制来规避冲突。

## 约束

- `upstream_branch=main`、`integration_branch=dev`、`release_branch=master`。
- `origin/main` 是上游镜像分支；当前可 fast-forward 21 个提交到固定目标，候选合并前需单独授权推送并核验 `origin/main == upstream/main == upstream_target_sha`。
- 分支权威以用户直接规则、已跟踪 `.agents/README.md` 和项目 skill 为准：代码 `dev -> master`；本地 ignored `CLAUDE.md` 的旧 master-first 说明不作为本轮执行权威。
- 本轮唯一显式上游 skip 为新增 `AGENTS.md`；需在候选合并确认清单中单独获得用户确认，同提交的 CI/tests/package/README 仍吸收。
- `.agents` 只允许进入 `dev`；`master` 当前树必须保持无 `.agents`。
- 候选合并前必须输出完整清单、冲突与建议，并获得用户确认。
- 合并前必须重新 fetch 并确认目标仍为 `d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`。
- 持续代码写入必须在通过治理门禁的隔离 worktree 中执行。

## 执行模式

- Execution Mode: supervised
- Auto-Continue Between Loops: no
- Auto-Continue Between Tasks: no
- User Authorization Confirmed: yes
- Authorization Scope: 上游检测、治理落盘和方案评审；候选合并及后续外部副作用仍按 checkpoint 单独确认。

## Task Success Criteria

- Criterion: 上游更新清单和冲突预检完整且绑定固定 SHA。
  - Verification: 检查 `evidence/upstream-update-inventory.md`、`evidence/conflict-precheck.md` 与 `git rev-parse upstream/main`。
  - Pass Criterion: 清单覆盖 38 个上游提交的可审查分组，所有冲突和 fork 保护点有处理建议，目标 SHA 一致。
- Criterion: 候选合并通过评审和验证。
  - Verification: `evidence/post-merge-review-loop.md`、`evidence/verification-report.md`、`bun run test`、`bun run verify`、`test:usage`、type-check、浏览器 QA、diff/conflict scan。
  - Pass Criterion: 最后一轮评审无新增 finding，无未处理 medium 及以上问题；上游 16 个测试和 fork 测试全部执行；provider、Auth Files、Visual Config、Usage 关键页面行为通过。
- Criterion: 分支与发布边界正确。
  - Verification: 远端 refs、dev/master candidate SHA、非 `.agents` 树等价 diff、`git ls-tree -r master -- .agents`、Actions/Release asset 证据。
  - Pass Criterion: `dev` 保留治理记录，`master` 无 `.agents` 且业务树等价；build 与 release 门禁在实际 master candidate 上通过。

## 风险与未知

- 上游跨度为 `v1.17.10..v1.18.3`，包含 38 个提交并跨越 minor 版本；fork 自基线后有 82 个独有提交。
- 上游可能重构 provider、auth-files、usage、插件或配置 UI，与 DisplayName、批量额度、scoped poll、ZIP、API Key 回显和 usage v2 定制形成行为冲突。
- package/Bun/Vite 依赖和单文件 release workflow 可能变化，需要锁文件与构建链路专项核验。

## 全局停止条件

- `upstream/main` SHA 漂移。
- 出现未处理 high/critical，或 medium accepted risk 未获用户确认。
- fork 定制保护策略无法证明，或 merge-tree/验证环境不可用。
- 需要超出当前授权的 install、push、master 合入、tag、release、部署或破坏性操作。

## Loop 策略

- L01：仓库分析、更新清单、冲突预检、治理方案与独立方案评审，结束于用户确认 checkpoint。
- L02：用户确认后在隔离 worktree 执行候选合并和冲突解决。
- 后续 loop 仅在 L02 闭环后创建，用于合并后评审验证、提交推送和可选发版。

## 状态权威源

- live 状态以 `ulw-board.md` 为准。
- 机器可读状态以 `ulw-state.json` 为准。
- 任务静态边界以本文件为准。
- 治理方案以 `evidence/governance-plan.md` 为准。

## 状态指针

- 当前 loop 与 phase：见 `ulw-board.md`。
