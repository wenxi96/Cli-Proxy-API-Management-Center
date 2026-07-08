Bugfix Status
- workflow.operation.name: bugfix_delivery
- workflow.operation.status: fixed
- workflow.root_cause.status: confirmed
- workflow.verification.status: pass
- workflow.regression_guard.status: alternative

## 问题摘要

- 问题: Codex 批量检查卡片把月度额度显示为 5 小时额度，并展示空 weekly 行。
- 影响: 同一个认证文件在批量检查 B 路和单文件刷新 A 路展示不一致。
- 预期: B 路 Codex 展示按 A 路单文件刷新逻辑处理。
- 实际: B 路仍用通用 batch rows 适配，未复用 A 路 Codex state 适配器。

## 复现

- 前置条件: batch result 中存在 `id=five-hour` 但 `limit_window_seconds=2592000` 的 Codex window，同时存在仅含 `limit_window_seconds=604800` 的空 weekly window。
- 步骤: 用 Vite SSR loader 加载当前 `quotaView.tsx` 并调用 `batchResultToQuotaView`。
- 当前结果: 修复后只输出一个 `monthly` 行，percent 为 75，空 weekly 未进入 rows。

## 最小复现边界

- 最小边界: `batchResultToQuotaView` 的 Codex 分支。
- 已排除项: 不依赖真实浏览器、后端服务实例或 i18n 真实文案。
- 剩余限制: 未执行浏览器人工截图验证。

## 根因

- 根因: B 路 Codex 展示没有先归一成 `CodexQuotaState` 并复用 A 路 `codexStateToQuotaView`，而是直接把 batch windows 当通用 rows 渲染。
- 证据: 原 B 路 `batchResultToQuotaView` 对 Codex 仍调用 `buildBatchQuotaRows`；A 路 Codex 已有 `codexStateToQuotaView`。
- 证据引用: path:src/features/authFiles/utils/quotaView.tsx
- 为什么这是根因: 错误发生在进入统一 `QuotaRowsView` 前的视图模型构建阶段，渲染组件本身无法纠正错误 window 元信息。

## 修复策略

- 选定修复: Codex batch result 先转换为 `CodexQuotaState`，再调用 `codexStateToQuotaView`；按窗口时长修正月度 meta，并过滤无展示数据的空窗口。
- 为什么这样修: 让 B 路 Codex 复用 A 路展示适配器，避免继续维护两套 Codex 展示逻辑。
- 根因关联: 消除 B 路独立 Codex 展示分支。
- 放弃的候选方案: 不只改 label 映射，因为 reset credits、订阅到期、plan 和 window 过滤都应走同一 A 路 adapter。

## 改动摘要

| 文件 | 改动类型 | 改动内容 | 必要性 | 根因关联 |
|------|----------|----------|--------|----------|
| `src/features/authFiles/utils/quotaView.tsx` | code | 新增 batch Codex 到 `CodexQuotaState` 的转换，并在 Codex 分支复用 `codexStateToQuotaView` | 统一 A/B Codex 展示路径 | 直接修复双路径适配不一致 |
| `src/features/authFiles/utils/quotaView.tsx` | code | 按月度窗口时长修正 meta，过滤无展示数据的空 Codex window | 修复月度误标和空 weekly 行 | 覆盖用户反馈样本 |
| `.agents/tasks/20260703-codex-batch-quota-display-parity/*` | docs | 中文记录任务、根因、验证和收口 | 满足治理记录要求 | 保留决策证据 |

## 提交与发布

- 修复提交：`dev@75a4d64`
- 发布合并：`master@cbe6d0e`
- 发布标签：`v1.17.8-wx-2.9`
- 发布后复核：远端 `dev` / `master`、发布标签、GitHub Build and Release 发布工作流、发布页面与 `management.html` 资产均已检查通过。

## 验证

| 检查项 | 命令或步骤 | 最新结果 | 证据 | 范围 |
|--------|--------------|----------|------|------|
| 类型检查 | `npm run type-check` | pass | command:tsc --noEmit | 前端类型 |
| Lint | `npm run lint` | pass | command:eslint | 前端源码规范 |
| 生产构建 | `npm run build` | pass | command:vite build | 前端构建 |
| 原问题样本行为 | `node --input-type=module` + Vite SSR load `quotaView.tsx`，调用 `batchResultToQuotaView` | pass | log:rowCount=1,key=monthly,label=codex_quota.team_secondary_window | Codex B 路展示适配 |

## 回归防护

- 防护类型: alternative-guard
- 位置: `.agents/tasks/20260703-codex-batch-quota-display-parity/progress.md`
- 防止什么: 防止后续改动再次让原问题样本输出 5 小时或空 weekly 行。
- 为什么这样足够: 当前前端仓库没有 test 脚本、Vitest 或 Jest 依赖；Vite SSR loader 能直接加载真实 `quotaView.tsx` 并可重复检查导出函数行为。
- 为什么自动化测试不适用: 引入新测试框架会扩大本次 bugfix 范围，当前仓库尚未建立前端单测基建。

## 风险与未知

- 剩余风险: 未执行浏览器人工截图验证。
- 未覆盖场景: 非 Codex provider 仍走通用 batch 路径，本次未改变其展示。
- 剩余未知: 后端真实 provider 是否会返回更多 additional rate limit 形态，需后续 HAR 或 live 样本验证。

## 需要用户提供

None
