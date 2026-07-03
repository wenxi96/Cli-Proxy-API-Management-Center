---
Status: implemented
Created: 2026-07-03
Owner: frontend
Execution Route: direct_inline
---

# 凭证统计 Token 与金额明细展示

## 任务身份判定

本任务为新建独立任务。历史任务 `20260629-auth-file-quota-display-unification`、`20260703-codex-batch-quota-display-parity` 解决认证文件额度展示一致性；本任务面向使用统计页的“凭证统计”能力，新增 token、估算金额和单凭证明细弹窗，目标、范围和验收条件不同，不复用旧任务目录。

## 背景

当前使用统计页已经能展示总 token、模型统计、API endpoint 统计、请求事件明细和模型价格设置。`CredentialStatsCard` 目前只按凭证聚合请求次数和成功率，没有 token breakdown、估算金额，也不能点击某个凭证查看调用明细。

## 目标

- 在凭证统计表中展示每个认证文件/凭证的请求数、成功率、输入/输出/推理/缓存/总 token 和估算金额。
- 支持点击单个凭证打开调用明细弹窗，展示该凭证下的请求事件、token breakdown、模型、结果和延迟。
- 优先接入后端新增的认证文件 usage 聚合与明细 API；在旧后端没有新接口时，允许用现有 `/usage` details 本地聚合作为兼容降级。
- 金额沿用当前前端模型价格表，明确显示为估算金额；无价格时显示未配置状态；部分模型缺少价格时显示部分覆盖状态，不把低估金额当完整金额。

## 范围

- 扩展 usage 类型、API service 和凭证统计聚合工具。
- 修改 `CredentialStatsCard` 表格列与交互。
- 新增或复用 modal 组件展示单凭证明细。
- 补充 usage i18n 文案和样式。
- 运行前端类型检查、构建或聚焦测试。

## 非目标

- 不安装插件，不依赖 `cpa-key-policy` 或 `codex-token-usage`。
- 不展示 prompt、response body、原始密钥、token 或 cookie。
- 不把估算金额称为 provider 真实账单。
- 不重做整个使用统计页布局。
- 不修改额度展示逻辑。

## 约束

- 认证文件关联以 `auth_index` 为主键，展示名仍复用现有 `sourceResolver` 和 auth files list 映射。
- `auth_index` 按普通字符串处理，不以固定长度或十六进制格式作为前端过滤、匹配或 URL 拼接前提。
- 旧后端缺少 `usage.auths` 或新明细接口时，前端应尽量从现有 `usage.apis.*.models.*.details` 本地聚合，保证页面不崩溃。
- 大量明细场景下弹窗需要分页或最多渲染限制，不一次渲染全部历史。
- 多语言文件需同步补齐中文、繁体中文、英文、俄文。
- 估算金额必须记录价格覆盖状态：完整覆盖、部分缺失、全部未配置三类状态都要有明确 UI 文案。

## 验收条件

- 凭证统计表出现 token breakdown 和估算金额列，请求数/成功率保持现有展示能力。
- 行点击或明确操作按钮能打开单凭证明细弹窗，弹窗只展示该凭证的数据。
- 弹窗明细包含时间、模型、来源/凭证、结果、延迟、输入/输出/推理/缓存/总 token 和估算金额。
- 模型价格未配置时，金额列显示未配置或 `--`，不会显示错误金额。
- 同一凭证混合已配置价格模型和未配置价格模型时，金额列显示已覆盖部分的估算值，并明确提示部分价格未配置。
- 旧后端响应下仍能基于现有 usage details 展示基础 token 统计。
- `bun run type-check` 和 `bun run build` 通过，必要时补充组件或工具测试。

## Canonical 文档

- 需求与设计: `specs/2026-07-03-frontend-auth-usage-token-cost-statistics-design.md`
- 实施计划: `plans/2026-07-03-frontend-auth-usage-token-cost-statistics-implementation-plan.md`
