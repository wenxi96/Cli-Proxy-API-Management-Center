---
Status: released
Created: 2026-07-09
Owner: frontend
Execution Route: multi_agent
---

# 前端 Usage Token 与金额明细展示升级

## 任务身份判定

本任务为新建独立任务。历史任务 `20260703-frontend-auth-usage-token-cost-statistics` 已发布并完成凭证统计 token、估算金额和单凭证明细弹窗第一阶段能力。本任务继续升级使用统计模块的 token/cost 语义，新增 canonical normalization、缓存用量与缓存比、默认官方价格表、输入/输出/缓存金额拆分、unknown usage 状态和图表/导出一致性，目标与验收条件已经扩大，不复用已 released 的历史任务目录。

## 背景

当前使用统计模块已经能展示请求次数、token、凭证统计和估算金额，但存在几个待治理点：部分页面直接对缺失 token 做 `Number()` 或默认 0；价格设置仍使用“提示/补全”命名；成本图和 sparkline 对 partial/unknown 状态语义不清；默认价格表缺失；reasoning/cache token 容易被重复计入 total 或 cost。后端新方案会提供更完整的 request detail facts，前端需要以统一 normalization 消费这些数据，同时保持原有统计项不受影响。

## 目标

- 在原有统计信息基础上新增每个凭证的请求 token 明细，包括输入、输出、推理、缓存读、缓存写、缓存总量、总 token、缓存比。
- 新增估算金额明细，包括输入金额、输出金额、缓存金额、总金额和价格覆盖状态。
- 建立 `NormalizedUsageDetail` 单一消费形态，store/cache/UI/export/chart 都从同一 normalization 读取。
- 内置官方默认价格表，按 `provider:model` exact `PriceKey` 匹配，用户 override 优先；缺 provider 的旧数据只进入 legacy fallback，不冒充官方 exact default。
- 移除或替换“提示/补全价格”展示命名，改为输入/输出/缓存价格。
- 引入 deterministic cost status：`unknown_usage > unconfigured > partial > complete`。
- `unknown_usage` 和 `unconfigured` 不画 0，不把未知成本作为 0 成本展示。
- 保持原有总请求、成功率、总 token、模型统计、事件明细等统计项继续可用。

## 范围

- 修改 usage API 类型、normalization、cost calculation、model price storage 和默认价格表。
- 修改凭证统计、请求明细弹窗、请求事件详情、趋势图/sparkline、导出字段。
- 修改价格设置 UI 文案与字段语义。
- 补充 i18n、类型检查、构建验证和必要的单元/工具测试。

## 非目标

- 不安装插件，不依赖 `cpa-key-policy` 或 `codex-token-usage`。
- 不展示 prompt、response body、原始密钥、token 或 cookie。
- 不把估算金额称为真实 provider 账单。
- 不改变额度展示逻辑。
- 不把价格配置迁移到后端。
- 不删除原有统计面板，只在现有统计基础上增加明细和语义修正。

## 约束

- 代码改动必须在 `dev` 分支；`.agents` 治理记录只提交 `dev`，不得合入 `master`。
- 旧后端响应必须兼容；缺少新字段时通过 normalization 产生 `unknown_usage` 或 null/gap，不崩溃。
- `reasoning_tokens` 默认按 output 明细子集处理，除非后端明确 `reasoning_cost_mode=separate`。
- `cached_tokens`、`cache_read_tokens`、`cache_creation_tokens` 不得重复叠加进 input/total。
- 成本展示缺价格或缺 usage 时不得显示 0；只有真实 known zero 才显示 0。
- 四语言文案需要同步。
- 页面布局不得出现文本溢出或按钮/表格重叠。

## 验收条件

- usage 数据进入 store 后统一产生 `NormalizedUsageDetail` 或等价 canonical facts；组件不再各自解析原始 detail。
- 凭证统计表与单凭证明细弹窗展示输入/输出/推理/缓存/总 token、缓存比、输入/输出/缓存/总估算金额。
- 价格设置 UI 使用输入/输出/缓存价格，并加载前端静态 official defaults；用户 override 继续生效。
- 成本状态按 `unknown_usage > unconfigured > partial > complete` 聚合；unknown/unconfigured 不画 0。
- 请求事件详情、CSV/JSON 导出、cost trend/sparkline 与凭证统计使用同一 normalization/cost 语义。
- 旧后端和新后端 fixture 均能渲染，不影响原有请求数、成功率、总 token、模型统计。
- `bun run type-check`、`bun run build`、必要的工具测试通过。

## Canonical 文档

- 需求与设计: `specs/2026-07-09-frontend-usage-token-cost-detail-v2-design.md`
- 实施计划: `plans/2026-07-09-frontend-usage-token-cost-detail-v2-implementation-plan.md`
