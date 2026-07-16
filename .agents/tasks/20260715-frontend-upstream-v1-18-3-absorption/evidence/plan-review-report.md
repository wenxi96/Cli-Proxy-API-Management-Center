# 前端吸收方案评审报告

## Round 1

- reviewer: Hypatia / 019f6536-58ab-7e32-9a93-f3d2124a28a6
- raw submission: `coordination/L01-review/workers/frontend-plan-reviewer/submissions/P01-frontend-plan-review/S01.md`
- verdict: `changes_requested`
- findings: Critical 0、High 7、Medium 3、Low 1。

| Finding | Disposition | 修订证据 |
|---|---|---|
| H-01 xAI 新额度被 fork adapter 丢弃 | fixed | `conflict-precheck.md` 新增 xAI weekly/product/on-demand/monthly 适配契约，并把 `quotaView.tsx` 列为显式修改点 |
| H-02 新 API Key editor 未覆盖 | fixed | Provider 契约纳入 `ApiKeyEntriesEditor.tsx`、single/multi key existing value 和 DisplayName 全链路 |
| H-03 未运行上游新增测试 | fixed | governance plan 要求 frozen install、`bun run test`、`bun run verify`、`test:usage` 和浏览器 QA |
| H-04 17 个自动热点无清单 | fixed | `conflict-precheck.md` 新增完整 30-path 账本 |
| H-05 origin/main 未对齐 | fixed | repository analysis、task charter 和 governance plan 固定 21-commit fast-forward 镜像步骤；执行仍等待用户 push 授权 |
| H-06 dev/master 推进未定义 | fixed | 固定 dev/master candidate SHA、`.agents` 空树、非 `.agents` 业务树等价和 master 复验 |
| H-07 batch quota 无持久门禁 | fixed | quota 契约和 risk-to-proof 要求 Bun 回归覆盖 five-hour/月度、空 weekly、primary/secondary 与 A/B parity |
| M-01 Scoped Poll 验证不具体 | fixed | risk-to-proof 增加 scoped defaults/providers、unknown fields、image passthrough、badge smoke |
| M-02 ZIP 只有静态证据 | fixed | risk-to-proof 增加跨页选择、去重、Content-Disposition、失败反馈和 mobile QA |
| M-03 Usage v2 缺页面验证 | fixed | 增加 `/usage` 导航、Chart.js、详情弹窗的代表性 fixture 浏览器 smoke |
| L-01 SHA/分类错误 | fixed | official API commit 修正为 `07562b7`；`4af4cf4` 补 CI/rules/docs/package 分类 |

## 主线程追加修订

- 上游 `4af4cf4` 新增的 `AGENTS.md` 不作为业务能力吸收，避免形成平行仓库规则源；只吸收该提交的 CI、test/verify、README/package 变化。
- 当前状态: 等待 Round 2 独立复评；复评通过前不得进入 L02。

## Round 2

- verdict: `changes_requested`。
- Round 1 除 API Key editor 外的十项 finding 均确认 fixed。
- R2-H01: API Key nullish fallback 不能处理必填空字符串。Disposition `fixed`：改为独立 edited-state，并定义 reveal/clear/remove index 语义。
- R2-H02: ignored `CLAUDE.md` 的旧分支说明、失效文档引用和 `AGENTS.md` skip 未形成权威边界。Disposition `fixed`：tracked `.agents/README.md` 与用户规则为权威；`AGENTS.md` 成为唯一显式 skip、候选门禁和用户确认项。
- 当前状态: 等待聚焦 Round 3；通过前不得进入 L02。

## Round 3

- R2-H01 API Key edited-state: fixed。
- R2-H02 规则与 skip 边界: fixed。
- new findings: Critical 0、High 0、Medium 0。
- verdict: `ready`。
- 退出结论: 前端 L01 方案评审可进入用户确认 checkpoint；尚未授权或执行 L02 merge。
