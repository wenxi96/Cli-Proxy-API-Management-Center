发布收口状态
- workflow.operation.name: release_closeout
- workflow.operation.status: complete
- workflow.rollout.status: completed
- workflow.verification.status: pass
- workflow.runtime_health.status: not_applicable
- workflow.rollback.status: limited
- workflow.followup.status: disclosed

## 发布摘要

- 摘要: 发布前端使用统计页凭证 token、估算金额和单凭证明细展示能力。
- 发布类型: package_publish

## 发布范围

- 已包含: 凭证统计 token 明细、估算金额、价格覆盖状态、单凭证明细弹窗、本地降级路径、四语言文案和样式。
- 未包含: 后端 API 发布由后端仓库 `v7.2.49-wx-2.10` 单独承载；真实 provider 账单金额不在本次前端范围内。
- 范围边界: 发布到 fork `wenxi96/Cli-Proxy-API-Management-Center` 的 GitHub Release `management.html`，不包含运行实例资产替换。

## 制品与目标

- 制品引用: GitHub Release `https://github.com/wenxi96/Cli-Proxy-API-Management-Center/releases/tag/v1.17.8-wx-2.10`
- 提交 / 标签 / 版本: `master@ca8e8032213711902835fdeefc1bcb926984410c`; `v1.17.8-wx-2.10`; version `1.17.8-wx-2.10`
- 目标: GitHub Release `management.html`。
- 渠道: Git tag push 触发 GitHub Actions `Build and Release`。
- 发布依赖: GitHub Actions、GitHub Release。

## 发布过程记录

- 触发方式: `git push origin v1.17.8-wx-2.10`
- 阶段: tag 创建、Build and Release 发布工作流、资产核验均完成。
- 最终发布结果: completed
- 发布引用: build: `Build and Release` run `28651472017`; 发布标签: `v1.17.8-wx-2.10`

## 验证

- 验证项: 远端标签与 master 目标提交一致
  - 结果: pass
  - 验证引用: command: `git ls-remote --tags origin v1.17.8-wx-2.10`
- 验证项: GitHub Actions 发布流程
  - 结果: pass
  - 验证引用: build: `Build and Release` run `28651472017` completed/success
- 验证项: Release 资产
  - 结果: pass
- 验证引用: 发布资产: GitHub Release API 返回 `management.html` uploaded；直接下载返回 HTTP 200

## 运行健康与监控

- 观察窗口: 发布后制品可用性核验窗口。
- 健康摘要: 不适用；本次是静态管理面板 HTML 制品发布，没有切换运行中服务或生产流量。
- 监控信号: Release 资产 HTTP 200、GitHub Actions success。
- 证据引用: 人工发布资产检查；GitHub Actions run

## 回滚与恢复

- 回滚路径: 如发现制品问题，可删除/下架错误 release/tag，并基于修复后的 `master` 重新发布递增 tag。
- 当前姿态: limited
- 限制: 已发布 `management.html` 可能已被用户下载；删除标签或 release 是外部副作用，需要再次确认。
- 恢复说明: 无数据库迁移和不可逆数据变更；代码级恢复可通过后续修复标签发布完成。

## 文档与沟通

- 已更新文档: 本任务 `closeout.md`、`progress.md`、`handoff.md`。
- 已发送沟通: 本会话内同步发布与核验状态。
- 支持交接: `handoff.md` 已更新为 released 状态。
- 剩余文档 / 沟通工作: 本轮治理收口记录已落地本地，但尚未提交入库；提交需另行授权。

## 已知问题与后续项

- 已知问题: 治理收口记录需要通过独立治理提交入库
  - 影响: 不影响已发布标签或 `management.html` 发布资产；仅影响仓库工作区清洁度和治理记录持久化。
  - 负责人 / 依赖: 本轮历史治理记录整理提交。
  - 下一步: 本轮仅提交 `dev` 分支治理文件，继续保持 `master` 不包含 `.agents`。
  - 跟踪引用: path: `.agents/tasks/20260703-frontend-auth-usage-token-cost-statistics/`

## 后续关注

- 需要: 后续提交或合并时继续隔离 `.agents` 与业务代码，并禁止将 `.agents` 合入 `master`。
- 原因: 当前 release 已完成；治理记录只应作为 `dev` 分支本地治理历史保留。
- 截止时间 / 触发条件: 每次整理治理记录、提交 `dev` 或准备发布分支时复核。
