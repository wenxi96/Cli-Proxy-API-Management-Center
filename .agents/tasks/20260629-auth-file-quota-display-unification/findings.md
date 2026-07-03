# Findings — 认证文件额度展示统一化

## 两处入口的渲染路径

- **A 单文件刷新**: `AuthFileQuotaSection.tsx` → `config.renderQuotaItems(quota, t, helpers)`，5 个 provider 各自实现（`quotaConfigs.ts` 的 `renderCodexItems`/`renderClaudeItems`/`renderAntigravityItems`/`renderKimiItems`/`renderXaiItems`），用 `React.createElement` 手写 vnode。
- **B 批量检查**: `AuthFileBatchQuotaSection.tsx` → `buildBatchQuotaRows(result, fallback)` 统一构建行 + JSX 渲染。

## 互斥显示

`AuthFileCard.tsx:138` `showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact && !batchCheckResult`。有 `batchCheckResult` 时显示 B 并隐藏 A —— 同一卡片两入口不会同时出现，但用户跨操作会先后看到两套展示。

## 关键差异（A vs B）

| 维度 | A | B | 统一方向 |
|------|---|---|---------|
| 百分比精度 | 整数 `Math.round` | 小数 `toFixed(1/2)` | A → B 小数 |
| amount | 仅 kimi/xai | 全 provider | A 补齐 |
| reset 格式 | 各 provider 独立 | 4 级回退 | A → B |
| 数据模型 | 5 套强类型 state | 1 套 `AuthFileBatchCheckWindow` | adapter 归一化 |

## provider 特有信息（保留，不统一）

- codex: reset credits 过期列表（`rateLimitResetCredits`）、plan_type、expires、reset_credits 可用数
- claude: extra_usage ($used/$limit)、plan_type
- antigravity: group→bucket 嵌套、plan_label、premium 徽章
- kimi: 无特有
- xai: pay-as-you-go 状态、plan(supergrok)

## 双 QuotaProgressBar 既有问题（不在本任务范围）

- `authFiles/components/QuotaProgressBar.tsx` 用 `AuthFilesPage.module.scss`
- `components/quota/QuotaCard.tsx` 内 `QuotaProgressBar` 用 `QuotaPage.module.scss`
- `quotaConfigs.ts` 的 `renderXxxItems` 通过 `helpers.styles` 注入 `QuotaPage.module.scss` 风格类名
- 本任务统一到 `AuthFilesPage.module.scss` 体系（A、B 两入口都在 AuthFilesPage）

## 代码基线

- dev 顶部: `d8b3dd4`（已含 v1.17.7 上游吸收）
- fork 定制 5 项不得丢失，本任务不触碰
