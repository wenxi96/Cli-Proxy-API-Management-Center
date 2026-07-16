# Findings

## 已确认事实

- 本任务为新建任务；既有 `20260707-frontend-upstream-v1-17-10-absorption` 已完成，不复用其 authority。
- 当前 `dev@878b4d7` 与 `origin/dev` 一致，工作区在任务创建前干净。
- 固定目标为 `upstream/main@d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`，精确 tag 为 `v1.18.3`。
- merge base 为 `v1.17.10@4064b01`；`dev...upstream/main` 为 82/38。
- `origin/main@fd22c148` 比固定目标少 21 个提交，不能代替 `upstream/main` 作为本轮权威目标。
- 最新 fork release 为 `v1.17.10-wx-2.12`。

## Fork 定制保护基线

- DisplayName、认证文件批量检查、scoped poll、ZIP 下载和 tag-only release。
- 已保存 API Key 显示/隐藏能力。
- usage v2 token/cache/cost normalization、默认价格和凭证明细展示。

## L01 已确认结论

- 采用单一固定目标 `v1.18.3`；13 个机械冲突和 17 个自动热点均已纳入 30-path ledger。
- xAI adapter 必须支持 weekly/product/on-demand/monthly；Codex 保持月度/五小时和空 weekly 的 A/B parity。
- 多 Key 回显使用独立 edited-state，主动清空后不得 fallback 到 existing value。
- 完整验证包含上游 16 个 Bun 测试、fork usage tests、verify/type-check、关键页面浏览器 QA。
- 分支权威为用户直接规则与已跟踪 `.agents/README.md` 的 `dev -> master`；ignored `CLAUDE.md` 只作能力参考。
- 唯一显式 skip 为上游新增 `AGENTS.md`；同提交 CI/tests/package/README 继续吸收，需用户确认。
- 三轮方案评审最终 `ready`，下一门禁是用户确认。
