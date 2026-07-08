# Codex 批量额度展示对齐修复

Status: complete

## 目标

修复前端批量认证文件检查后，Codex 文件明明只有月度限额却显示为 5 小时限额、并展示空周限额的问题。B 路 Codex 展示逻辑必须按照单个认证文件刷新 A 路的展示逻辑处理。

## 范围

- 调整 `batchResultToQuotaView` 的 Codex 分支：先把 batch result 转成 `CodexQuotaState`，再复用 A 路 `codexStateToQuotaView`。
- 按 `limit_window_seconds` 修正 batch window 的 Codex 月度元信息识别，兼容后端修复前可能残留的错误 id。
- 过滤没有展示数值的 Codex 空窗口，避免空 weekly 行继续渲染。
- 保留非 Codex provider 的通用 batch 展示路径。

## 非目标

- 不重写 QuotaRowsView。
- 不改单文件刷新真实 provider API 调用。
- 不引入新的前端测试框架或依赖。
- 修复实现阶段不自行提交、推送或发版；后续已按用户授权完成提交、推送、合入 `master` 和发版。

## 验收

- Codex batch card 的 plan、订阅到期、reset credits、windows 通过同一套 `codexStateToQuotaView` 生成。
- 月度窗口在 B 路显示为月度，不再显示为 5 小时。
- 没有有效数值的空周窗口不再渲染。
- `npm run type-check`、`npm run lint`、`npm run build` 通过。
- 修复提交已进入 `dev@75a4d64` 与 `master@cbe6d0e`，并随 `v1.17.8-wx-2.9` 发布。
