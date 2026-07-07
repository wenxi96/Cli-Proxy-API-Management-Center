# 前端上游更新吸收清单

## 基线

- 当前仓库：Cli-Proxy-API-Management-Center
- 当前分支：`dev`
- 当前 integration_branch：`dev@769b292fd4ed491ad2e8b11e9537323c9c3c8dda`
- 当前 release_branch：`master@ca8e8032213711902835fdeefc1bcb926984410c`
- 当前 fork 发布标签：`v1.17.8-wx-2.10`
- 上游目标：`upstream/main`
- 上游目标 SHA：`4064b01ac3a67be825495a1da8adf7534790d755`
- 上游最新 tag：`v1.17.10`
- 增量范围：`e9817a8ce1a4cde785bccc63df378e355075e6a7..4064b01ac3a67be825495a1da8adf7534790d755`

## 汇总

- 上游新增提交数：8
- `dev...upstream/main`：fork 侧 72 个提交；上游侧 8 个提交
- `master...upstream/main`：fork 侧 79 个提交；上游侧 8 个提交
- 触达模块：provider workbench、sponsor provider、ClaudeAPI / Code0 provider、quota config、i18n、provider forms、provider adapters。
- 是否存在机械冲突：是，`src/features/providers/adapters.ts` 与 `src/features/providers/sheets/forms/BaseProviderForm.tsx`
- 是否存在行为冲突风险：是，DisplayName fork 定制与上游新增 provider 能力同文件叠加。
- 建议结论：可进入候选合并前确认阶段；真实合并需用户授权，建议隔离 worktree 处理。

## 逐项清单

### 1. `b1b1f96` feat: remove quota amount display when limit is not greater than zero

- 更新内容：额度配置显示逻辑调整，无有效 limit 时隐藏 amount。
- 影响模块：`src/components/quota/quotaConfigs.ts`、`src/types/quota.ts`。
- 功能作用：优化 pay-as-you-go 或无限额场景展示。
- 风险：中；需要和前端认证文件额度展示修复一起回归。
- 与 fork 定制能力关系：影响额度展示相关页面。
- 建议处理：吸收后检查批量检查和单文件刷新展示。

### 2. `232b8e7` feat: add support for ClaudeAPI provider and related configurations

- 更新内容：新增 ClaudeAPI provider、icon、provider descriptor、表单默认 base URL 等。
- 影响模块：provider workbench、provider adapters、forms、i18n。
- 功能作用：支持 ClaudeAPI 赞助 provider 配置。
- 风险：高；与 DisplayName 定制在 adapters/form 文件冲突。
- 与 fork 定制能力关系：直接冲突。
- 建议处理：真实合并时保留 DisplayName，同时叠加 ClaudeAPI brand 和 Claude-like form 行为。

### 3. `d2d1cf8` feat: add support for Gemini API in sponsor provider

- 更新内容：Sponsor provider raw 增加 Gemini 通道。
- 影响模块：sponsor provider adapter、types、resource view。
- 功能作用：支持赞助商 provider 聚合 Gemini。
- 风险：中；需要确保 ApiKeyFun 和新 Code0 资源统计准确。
- 与 fork 定制能力关系：provider workbench。
- 建议处理：吸收并回归 sponsor provider 展示。

### 4. `7bad64e` feat: update hidden provider brands and filter logic in ProvidersWorkbenchPage

- 更新内容：调整 provider 隐藏品牌与过滤逻辑。
- 影响模块：`ProvidersWorkbenchPage.tsx`、provider descriptors。
- 功能作用：让 sponsor provider 分组显示符合上游策略。
- 风险：中；可能影响 fork provider tab / 卡片可见性。
- 与 fork 定制能力关系：provider workbench。
- 建议处理：吸收后检查 provider 列表和筛选。

### 5. `81e9edf` feat: add 'code0' to the provider brand order list

- 更新内容：新增 Code0 brand 顺序和资源定义。
- 影响模块：provider brand order、icons、i18n。
- 功能作用：支持 Code0 provider。
- 风险：中；与 sponsor provider 聚合逻辑相关。
- 与 fork 定制能力关系：provider workbench。
- 建议处理：吸收。

### 6. `ca25c65` fix(providers): keep Code0 and ClaudeAPI groups visible

- 更新内容：修复 Code0 和 ClaudeAPI 分组可见性。
- 影响模块：provider filters / display。
- 功能作用：避免新增 provider 组被隐藏。
- 风险：中。
- 与 fork 定制能力关系：provider workbench。
- 建议处理：吸收。

### 7. `88d60bf` add xai pay-as-you-go quota progress

- 更新内容：新增 xAI pay-as-you-go quota progress。
- 影响模块：quota config、i18n。
- 功能作用：展示 xAI 按量计费额度进度。
- 风险：中；与 fork 额度展示统一逻辑需回归。
- 与 fork 定制能力关系：额度展示。
- 建议处理：吸收后重点检查 xAI/Grok 卡片和认证文件额度卡片。

### 8. `4064b01` Merge pull request #338 from jellyfish-p/main

- 更新内容：合并 xAI pay-as-you-go quota progress。
- 影响模块：quota。
- 功能作用：汇总第 7 项。
- 风险：同第 7 项。
- 与 fork 定制能力关系：额度展示。
- 建议处理：随第 7 项处理。
