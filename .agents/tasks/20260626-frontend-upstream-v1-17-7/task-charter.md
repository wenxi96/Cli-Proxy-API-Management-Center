# T01 前端吸收上游 v1.17.7

## 任务摘要

将前端 `Cli-Proxy-API-Management-Center` 的 `dev` 分支从当前 fork 集成状态吸收到最新上游镜像 `main == origin/main == upstream/main == acf432b` / `v1.17.7`，在保留 fork 定制的前提下完成计划、独立审核修复、代码合并和验证。

## 成功定义

- 新任务计划和提交级吸收清单已落地在本任务目录。
- 前端方案已经过独立审核修复流程，评审结论无阻断问题。
- `dev` 成功吸收 `v1.17.7`，冲突解决保留 fork 定制。
- 前端验证通过，至少覆盖 `bun run type-check`、`bun run lint`、`bun run build`。
- 未经用户授权不推送 `dev` / `master`，不创建 tag，不触发 release，不发布 `management.html`。

## 非目标

- 不处理后端仓库；后端使用独立任务 `20260626-backend-upstream-v7-2-42`。
- 不复用旧跨仓库任务作为当前 authority。
- 不在计划和审核阶段修改业务代码。
- 不发布 release，不上传构建产物。

## 约束

- 分支模型：`main` 为上游镜像，`dev` 为开发/集成分支，`master` 为稳定发版分支。
- 当前任务先在 `dev` 上推进；`main` 不写入 fork 治理或代码改动。
- 必须保留 fork 定制：DisplayName、Auth Files Batch Check、Scoped Poll、ZIP 下载、tag-only release 和版本后缀。
- 代码写入前必须完成方案审核修复流程。
- 多 agent 审核默认 read-only，不直接写业务代码。

## 执行模式

- Execution Mode: supervised
- Auto-Continue Between Loops: no
- Auto-Continue Between Tasks: no
- User Authorization Confirmed: no

## Task Success Criteria

- Criterion: 计划和提交级吸收清单完整落地。
  - Verification: 检查 `task-charter.md`、`plans/2026-06-26-frontend-upstream-v1-17-7-implementation-plan.md`、`findings.md`、`ulw-board.md`、`loops/`。
  - Pass Criterion: 文件存在，路径归属本仓库，且不再指向后端跨仓库任务作为当前 authority。
- Criterion: 审核修复流程完成且无阻断问题。
  - Verification: 检查 `coordination/` 或 `progress.md` 中 reviewer/verifier 结论和主线程裁决。
  - Pass Criterion: 所有阻断项已修正或明确降级为非阻断，并记录证据。
- Criterion: 前端 `dev` 吸收 `v1.17.7` 后验证通过。
  - Verification: `bun run type-check`; `bun run lint`; `bun run build`; fork 定制人工/自动清单。
  - Pass Criterion: 命令 exit 0，且无未解决冲突标记，定制功能未丢失。

## 风险与未知

- `AuthFilesPage.tsx` 同时承载上游状态过滤卡和 fork 批量检查、启用/禁用筛选、scoped poll 等定制。
- Provider 相关冲突需要同时保留 fork DisplayName 和上游 APIKEY.FUN / openaiCompatibility 逻辑。
- `config.ts` / `transformers.ts` 需要保留 scoped-pool 与低额度自动禁用字段，同时吸收上游 `antigravityCredits`。

## 全局停止条件

- `origin/main` / `upstream/main` 再次漂移。
- 发现 fork 定制无法通过小范围整合保留。
- `bun install` / `bun run build` 环境不可用且无法解释剩余风险。
- 需要 push、tag、release、发布 `management.html` 或凭证。

## Loop 策略

- L01：任务文档和实施计划落地，建立提交级吸收清单和初始治理状态。
- L02：独立方案审核修复，先由 reviewer/verifier 检查方案和冲突策略，主线程修正文档到无阻断。
- L03：审核通过后执行代码合并和冲突解决。
- L04：验证、收口、交接，并等待用户授权是否推进 `master` / release。

## 状态权威源

- live 状态以 `ulw-board.md` 为准。
- 机器可读状态以 `ulw-state.json` 为准。
- 计划权威以 `plans/2026-06-26-frontend-upstream-v1-17-7-implementation-plan.md` 为准。

## 状态指针

- 当前 active loop：L02
- 当前阶段：以 `ulw-board.md` 为准。
