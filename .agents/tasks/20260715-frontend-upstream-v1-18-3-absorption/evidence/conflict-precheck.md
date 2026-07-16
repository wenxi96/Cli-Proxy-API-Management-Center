# 前端冲突预检报告

## 预检命令

- 命令: `git merge-tree --write-tree --name-only dev d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`
- 目标分支: `dev@878b4d7`
- 上游目标: `d3df9b07` / `v1.18.3`
- 退出码: `1`（存在内容冲突）
- merge-tree object: `e04732405bda28474bcf9ae19a522e34ded256b4`

## 机械冲突

- 结论: 13 个内容冲突，另有 17 个双方修改但可自动合并的重叠文件。

| 文件 | 冲突来源 | 建议解决 |
|---|---|---|
| `bun.lock` | fork chart/release tool依赖；上游 dependency refresh | 先语义合并 package，再在隔离 worktree 用仓库 Bun 版本重建 lock；禁止手工拼 lock |
| `package.json` | fork `test:usage` 与 release tooling；上游依赖、Bun tests | 保留 fork scripts 并吸收上游版本/依赖/test，去重同义脚本后 frozen install |
| `src/components/ui/icons.tsx` | fork API Key reveal 等图标引用；上游 dead icon cleanup/alias | 保留仍被 fork 使用的 Eye/EyeOff 等导出，吸收安全别名与真正未引用清理 |
| `BaseProviderForm.tsx` | fork DisplayName/API Key reveal；上游折叠 API key/model entries | 在上游新布局中重接 DisplayName 与 reveal toggle，不能整文件 ours/theirs |
| `useVisualConfig.ts` | fork scoped poll 字段；上游并发安全、Redis range、image passthrough | 采用上游 updater/并发语义并完整保留 fork 字段 round-trip |
| 四语言 locale | fork usage/API Key/batch 文案；上游 provider/plugin/quota/official API 文案与 orphan cleanup | 结构化 key 合并，保留所有仍有引用的 fork key；用 key scan 与 JSON parse 验证 |
| `src/services/api/config.ts` | fork scoped-pool/zero-quota API；上游 dead endpoint cleanup | 逐导出做引用审计，仅删除真实无引用上游字段，保留 fork API 与序列化 |
| `src/stores/index.ts` | fork batch state export；上游 quota cache isolation | 同时保留 batch store 与新 connection-scoped quota store export |
| `src/stores/useConfigStore.ts` | fork scoped-pool state；上游删除 dead actions/cache | 基于引用结果做最小清理，保留 fork action 和字段 |
| `src/types/visualConfig.ts` | fork scoped poll/threshold fields；上游 Redis validation/image passthrough | 合并字段并同步 defaults、normalizer、form 与 API 类型 |

## 机械冲突的预期 resolved shape

| 文件 | 必须保留的 fork 语义 | 必须吸收的上游语义 | 禁止结果 |
|---|---|---|---|
| `bun.lock` | fork chart/release/usage 依赖 | v1.18.3 dependency graph 与 form-data override | 手工拼接 lock 或 lock/package 不一致 |
| `package.json` | `test:usage`、fork release tooling | `test`、`verify`、新依赖和 Bun 版本 | 覆盖 usage tests 或未执行新增 16 个测试 |
| `src/components/ui/icons.tsx` | Eye/EyeOff 等仍被 fork 使用的导出 | 上游安全 alias 和真实 dead icon cleanup | API Key 显隐图标丢失 |
| `BaseProviderForm.tsx` | DisplayName、单 Key 已保存值回显 | 折叠式 API key/model 布局 | 只保留布局而丢失 create/edit/clear 语义 |
| `useVisualConfig.ts` | scoped poll/threshold 字段 round-trip | 最新快照并发更新、Redis range、image passthrough | 并发保存时覆盖未触碰字段 |
| 四语言 locale | usage/API Key/batch/scoped 文案 | provider/plugin/quota/official API 文案和 orphan cleanup | 删除仍被 fork 引用的 key |
| `src/services/api/config.ts` | scoped-pool/zero-quota API 和序列化 | 上游真实 dead endpoint cleanup | 删除 fork endpoint 或字段 |
| `src/stores/index.ts` | batch state export | connection-scoped quota cache export | 任一 store 不可导入 |
| `src/stores/useConfigStore.ts` | scoped-poll state/actions | 上游并发语义与真实 dead action cleanup | 保存时丢 scoped 字段 |
| `src/types/visualConfig.ts` | scoped poll/threshold 类型/defaults | Redis validation/image passthrough 类型 | UI、store、API defaults 不一致 |

## Provider 表单集成契约

1. 以上游折叠布局为结构基线，但必须同时修改新增的 `ApiKeyEntriesEditor.tsx`，为每个 entry 维护独立 edited-state，例如随删除重排的 `editedApiKeyEntryIndices`。
2. reveal 且该 entry 未编辑、`apiKey === ''` 时才显示 `existingApiKey`；用户首次输入或清空后标记 edited，此后始终显示并提交 `apiKey`，不得再次 fallback 到 existing value。
3. 单 Key和多 Key都要区分未编辑、编辑、清空、删除和新增；未编辑保存不得覆盖服务端已有 key；删除 entry 时 edited/show-password index 必须同步重排。
4. DisplayName 必须贯穿 BaseProviderForm、types、adapters、providers API、useProviderWorkbench 的 create/edit/clear 与并发更新链。
5. API Key 不得进入日志、治理证据、fixture 快照或错误提示；测试使用虚构值。

## Quota 展示集成契约

1. 将 fork 的 `xaiStateToQuotaView` 纳入显式修改点，支持 upstream weekly、product usage、on-demand 和 monthly，不能继续只输出 monthly。
2. Auth Files 单文件、批量检查和 QuotaPage 对同一 provider/window 的分类与数值必须一致；未知或无数据窗口不渲染伪造行。
3. Codex additional windows 继续使用 canonical adapter；旧 five-hour ID 若窗口时长为月度不得显示为五小时，空 weekly 不得生成空行，primary/secondary 互换不能改变语义。
4. quota cache 必须按 connection 隔离，切换连接后不得复用其他后端的额度。

## 30 个重叠路径处置账本

下面包含 13 个机械冲突与 17 个自动合并热点。所有自动热点都需语义复核。

| 路径 | 结果 | 处置 | 保护点与验证 |
|---|---|---|---|
| `README.md` | auto | semantic-review | fork 安装/发版说明与上游功能文档并存 |
| `README_CN.md` | auto | semantic-review | 中文 fork 说明与上游更新并存 |
| `bun.lock` | conflict | regenerate | 合并 package 后用 Bun 1.3.14 重建并 frozen install |
| `package.json` | conflict | explicit-fix | 保留 test:usage，吸收 test/verify 和依赖 |
| `src/components/config/VisualConfigEditor.tsx` | auto | explicit-fix | scoped poll/threshold + image passthrough/Redis validation |
| `src/components/config/configSearchIndex.ts` | auto | semantic-review | 新旧配置项都可检索 |
| `src/components/layout/MainLayout.tsx` | auto | semantic-review | usage 导航、插件入口和布局不回归 |
| `src/components/quota/quotaConfigs.ts` | auto | explicit-fix | xAI weekly/product/on-demand/monthly + Codex canonical windows |
| `src/components/ui/icons.tsx` | conflict | explicit-fix | Eye/EyeOff 与上游 alias 共存 |
| `src/features/providers/adapters.ts` | auto | explicit-fix | DisplayName、existing key、并发字段 round-trip |
| `src/features/providers/components/ProviderResourceTable.tsx` | auto | semantic-review | 新 provider 资源与 fork display 行为 |
| `src/features/providers/sheets/forms/BaseProviderForm.tsx` | conflict | explicit-fix | 折叠布局 + DisplayName/API key reveal |
| `src/features/providers/sheets/forms/SponsorProviderForm.tsx` | auto | semantic-review | sponsor 聚合失败恢复和 fork provider |
| `src/features/providers/types.ts` | auto | explicit-fix | DisplayName/existing key 与上游 entries 类型 |
| `src/features/providers/useProviderWorkbench.ts` | auto | explicit-fix | create/edit/clear 与并发最新快照 |
| `src/hooks/useVisualConfig.ts` | conflict | explicit-fix | scoped fields + function/latest snapshot update |
| `src/i18n/locales/en.json` | conflict | key-merge | 仍有引用 key 的并集 |
| `src/i18n/locales/ru.json` | conflict | key-merge | 仍有引用 key 的并集 |
| `src/i18n/locales/zh-CN.json` | conflict | key-merge | 仍有引用 key 的并集 |
| `src/i18n/locales/zh-TW.json` | conflict | key-merge | 仍有引用 key 的并集 |
| `src/pages/AuthFilesPage.module.scss` | auto | semantic-review | batch/ZIP/mobile 可达性和新 official API UI |
| `src/services/api/authFiles.ts` | auto | semantic-review | batch、ZIP、official API、excluded rules |
| `src/services/api/config.ts` | conflict | explicit-fix | fork API + 上游 cleanup |
| `src/services/api/providers.ts` | auto | explicit-fix | DisplayName、existing key、concurrent update |
| `src/stores/index.ts` | conflict | explicit-fix | batch store + connection quota store |
| `src/stores/useConfigStore.ts` | conflict | explicit-fix | scoped state + latest snapshot update |
| `src/types/config.ts` | auto | semantic-review | official API/provider/config 类型并集 |
| `src/types/index.ts` | auto | semantic-review | fork exports 不被 dead cleanup 删除 |
| `src/types/visualConfig.ts` | conflict | explicit-fix | scoped/defaults + image/Redis 字段 |
| `src/utils/connection.ts` | auto | semantic-review | connection identity 与 quota cache 隔离 |

## 非重叠但必须联动审查的路径

| 路径/能力 | 原因 |
|---|---|
| `src/features/providers/sheets/forms/ApiKeyEntriesEditor.tsx` | 上游新增多 Key 编辑器，必须重接 existingApiKey reveal 语义 |
| `src/features/authFiles/utils/quotaView.tsx` | fork-only adapter 必须吸收 xAI 新额度语义，并保护 Codex A/B parity |
| `tests/*.test.ts` | 上游新增 16 个测试，是并发、OAuth、quota cache、plugin 与 visual config 的发布门禁 |
| batch quota 新 Bun 回归测试 | 历史月度误标五小时、空 weekly 回归目前缺少持久门禁 |
| 上游新增 `AGENTS.md` | 治理文件而非业务能力；为避免形成平行仓库规则源，本 fork 不吸收该文件，只吸收同提交的 CI/package/README 变化 |

## 显式 skip 与候选门禁

- 唯一显式 skip: 上游新增 `AGENTS.md`。原因是本 fork 的稳定规则已由已跟踪 `.agents/README.md` 承载，用户明确要求不在仓库根 `AGENTS.md` / `CLAUDE.md` 重复维护该规则。
- `4af4cf4` 的 CI、tests、package 和 README 变化仍必须吸收；只跳过该提交中的 `AGENTS.md` 路径。
- 候选合并后执行 `git ls-files --error-unmatch AGENTS.md`，预期失败；同时确认 `.github/workflows/ci.yml`、`tests/*.test.ts` 和 package 的 test/verify scripts 已进入候选。
- 此 skip 必须出现在发送给用户的候选合并确认清单中，未确认不得进入 L02。

## 行为冲突风险

### Provider 表单

- 风险说明: 上游将 API key/model 输入折叠，fork 刚发布可查看已保存 API Key；粗暴选一侧会造成 UX 回归或密钥状态错误。
- 建议解决: 以上游表单结构为布局基线，重新挂载 fork DisplayName 和显隐按钮；验证编辑、未修改、清空和保存四种状态。

### Visual Config 并发更新

- 风险说明: 上游修复并发 visual config 写入并清理 store；fork scoped poll 和阈值字段依赖同一链路。
- 建议解决: 使用上游函数式/最新快照更新语义，逐字段确认 fork 配置不丢失；添加 round-trip 和 concurrent update 测试。

### Auth Files 与额度

- 风险说明: 上游新增 official API、自定义 excluded rules 和额外窗口简化，可能重新引入月度误标五小时或空窗口。
- 建议解决: 保留 fork canonical quota display adapter，吸收上游数据/配置能力；复跑单文件与批量同文件一致性测试。

### 依赖与 dead-code cleanup

- 风险说明: 上游跨 minor 更新并大规模删除 4,450 行，fork-only 文件/exports 可能被误认作死代码。
- 建议解决: 禁止照搬删除清单；用 `rg`/TypeScript/lint/build 和 fork 保护断言逐项裁决，lock 最后重建。

## 合并建议

- 建议是否进入候选合并: 有条件允许。必须先完成完整 inventory、独立方案评审和用户确认，再在隔离 worktree 推进。
- 需要用户确认的点: 接受 13 个机械冲突和 17 个自动热点的语义合并策略；确认以 `v1.18.3` 单一目标吸收并保留全部 fork 定制；确认显式跳过上游新增 `AGENTS.md`，但吸收同提交的 CI/tests/package/README。
