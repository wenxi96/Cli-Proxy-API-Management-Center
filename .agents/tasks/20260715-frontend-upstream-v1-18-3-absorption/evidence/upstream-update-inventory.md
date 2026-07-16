# 前端上游更新吸收清单

## 基线

- 当前仓库: `wenxi96/Cli-Proxy-API-Management-Center`
- 当前分支: `dev@878b4d7`
- integration_branch: `dev`
- release_branch: `master`
- 当前 fork release tag: `v1.17.10-wx-2.12`
- 上游目标: `router-for-me/Cli-Proxy-API-Management-Center` `main`
- 上游目标 SHA: `d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`
- 上游最新 tag: `v1.18.3`
- 增量范围: `v1.17.10@4064b01..v1.18.3@d3df9b07`

## 汇总

- 上游新增提交数: 38
- 变更规模: 141 files，+4,766/-4,450。
- 触达模块: provider workbench、dead-code cleanup、quota、plugin store、auth files、visual config、stores、i18n、依赖/CI、image passthrough。
- 机械冲突: 13 files。
- 行为冲突风险: 高，集中在 provider 表单、visual config/scoped poll、auth-files quota、usage/i18n 和依赖清理。
- 建议结论: 以 `v1.18.3` 为单一目标语义合并；上游新架构优先，fork 功能逐项重接并验证，不采用整侧 ours/theirs。

## 功能分组

| 分组 | 更新了什么 | 影响模块与作用 | 主要风险 | 建议 |
|---|---|---|---|---|
| Provider 与 cleanup | 折叠 API key/model 表单、quick fill、删除 dead files/props/styles/icons/i18n | provider workbench、公共 UI、API/store/type | 误删 DisplayName、API Key 回显或 fork-only export | 上游结构为基线，基于真实引用保留 fork 能力 |
| Quota | weekly billing、xAI 周期显示、connection cache 隔离、额外窗口简化 | quota cards/configs/cache | 批量额度月度/五小时回归、缓存串连接 | 保留 fork adapter，吸收数据与缓存修复 |
| Plugin/Provider | plugin release 版本选择、FennoAI/Qiniu、sponsor 聚合保护 | plugin store、provider forms/API | 自定义 provider 与安装版本行为变化 | 吸收并加 provider/plugin 回归 |
| Config 并发与校验 | visual/provider 并发更新、Redis range、untouched fields | visual config、store、API | scoped poll/阈值字段丢失 | 使用上游并发语义，字段 round-trip 测试 |
| Auth Files | alias force mapping、excluded rules、OAuth unsaved edits、official API | auth files UI/API | fork batch parity/ZIP/状态持久化回归 | 语义合并并专项验证 A/B 路一致性 |
| Toolchain | 依赖更新、ESLint 修复、Bun test workflow | package/lock/CI | lock 冲突、test:usage 被覆盖 | 合并 package 后重建 lock，保留全部验证脚本 |
| Image passthrough | 禁用 image generation passthrough 模式 | visual config/types/tests | 与 scoped config 字段冲突 | 合并类型/default/API/UI 全链路 |

## 跨域能力与 fork 联动点

| 上游能力 | 上游主要路径 | fork 联动路径 | 合并作用与验证 |
|---|---|---|---|
| 折叠 provider key/model entries | `BaseProviderForm.tsx`、新增 `ApiKeyEntriesEditor.tsx` | provider types/adapters/API/workbench、DisplayName/API Key reveal | 保留新布局并补 existingApiKey 单/多 Key 回显、未编辑保存、清空/删除和 DisplayName 并发语义 |
| xAI weekly/product/on-demand quota | `quotaConfigs.ts` | `features/authFiles/utils/quotaView.tsx` | 将 xAI adapter 从 monthly-only 扩展到完整窗口；单文件、批量与 QuotaPage 同源 |
| Codex additional window 简化 | `quotaConfigs.ts` | fork canonical batch quota adapter | 保留月度不误标 five-hour、空 weekly 不渲染、primary/secondary parity 的持久测试 |
| Visual config 并发/image passthrough | VisualConfigEditor、useVisualConfig、types/store/API | scoped poll/threshold/defaults/providers | 采用 latest snapshot 更新，保证 fork 字段、unknown fields 和新字段 round-trip |
| Official API/excluded rules/OAuth dirty state | auth files UI/API/tests | batch state、ZIP、quota adapter | 新 API 能力与 fork 批量工作流并存；验证保存、切换、下载和额度展示 |
| Bun test/CI | `.github/workflows/ci.yml`、package scripts、16 个 `tests/*.test.ts` | `test:usage` 与 fork release workflow | 全量运行 `bun run test`/`verify`，保留 usage 专项与 v* tag-only release |

## 完整提交矩阵

| Commit | 更新内容 | 模块 | 风险 | 建议处理 |
|---|---|---|---|---|
| `0c565c8` | 折叠 provider API key/model entries | provider form | high | 上游布局 + 重接 DisplayName/API Key reveal |
| `e43df69` | 删除未使用组件和工具 | cleanup | medium | 按引用审计，保留 fork-only 文件 |
| `9d3e82e` | provider category quick fill 与翻译 | provider/i18n | medium | 吸收并合并四语言 |
| `066d25f` | 删除 orphan files/build config | cleanup/build | medium | 禁止批量照搬删除，逐文件确认 |
| `e36de50` | 删除 dead API endpoints/normalizers | API | high | 保留 scoped-pool/zero-quota fork API |
| `3ee7fce` | 删除 unused store actions/cache | stores | high | 保留 fork scoped config actions |
| `3785d75` | 删除 dead type/util exports | types | medium | TypeScript 引用审计后裁决 |
| `3c91d57` | 删除 dead props/render chains | UI | medium | 保留 fork props，lint/type-check |
| `c21d4ae` | 删除 dead global styles/tokens | styles | medium | 检查 fork 页面样式引用 |
| `82bb41c` | sidebar icon alias 去重 | icons | medium | 保留 API Key reveal 等仍用导出 |
| `d8f74ae` | 删除 orphan locale keys | i18n | high | 对 fork usage/auth/provider key 做引用扫描 |
| `550169c` | weekly billing 与 billing summary | quota | medium | 吸收，保持窗口标签适配 |
| `fe24d78` | plugin GitHub release 版本选择 | plugin store | medium | 吸收并验证官方源/版本限制 |
| `12bfeab` | status bar grid layout | layout | low | 自动合并后视觉检查 |
| `328bead` | FennoAI/Qiniu provider | provider | medium | 吸收 provider adapter/form/i18n |
| `3f86f79` | 简化 xAI weekly display | quota | medium | 与 fork quota adapter 对照 |
| `fd22c14` | xAI weekly 使用率与 reset time | quota | medium | 吸收并验证时间/百分比 |
| `637f399` | visual config 并发更新保护 | config | high | 作为合并基线，保留 fork 字段 |
| `022634b` | provider 并发更新保护 | provider | high | 吸收并测试并发保存 |
| `ab6b0b3` | sponsor 聚合防丢失 | provider | medium | 吸收，保留自定义 provider |
| `878abca` | auth-files alias force mapping | auth files | high | 与后端 Home/alias 行为联调 |
| `6c64e25` | plugin official source identity | plugin store | medium | 吸收，保留 fork store source |
| `c69e5fd` | dashboard model load failure 区分 | dashboard | low | 吸收并保留错误状态 |
| `2818921` | Redis retention range 校验 | config | medium | 吸收到 visual config 链路 |
| `4afba52` | alias 大小写无关校验 | auth files | medium | 吸收并补 fixture |
| `5694b10` | 未保存 OAuth 编辑保护 | auth files | medium | 吸收并验证 modal state |
| `2cd2de7` | 限制直接 plugin versions | plugin store | medium | 与 release selector 一起验证 |
| `6d54016` | sponsor 部分更新恢复 | provider | medium | 吸收并验证失败恢复 |
| `ad366ef` | custom excluded model rules | auth files | high | 吸收并保留 batch/ZIP 状态 |
| `47f7a9e` | 保留未触碰 plugin config fields | plugins | medium | 吸收并做 round-trip |
| `5754ecf` | quota cache 按 connection 隔离 | stores/quota | high | 吸收，保留 batch store export |
| `a4f7bb2` | 更新 dependencies/devDependencies | toolchain | high | 合并 package 后由 Bun 重建 lock |
| `2201fe1` | ESLint async loading/sort 修复 | lint/provider | low | 吸收并运行 lint |
| `73c3b15` | 保存 pending excluded rule | auth files | medium | 与 `ad366ef` 一并验证 |
| `4af4cf4` | CI 增加 Bun test，并新增上游 `AGENTS.md`、更新 README/package scripts | CI/rules/docs/toolchain | medium | 吸收 CI、test/verify、README/package；不新增并行 `AGENTS.md`，稳定分支/提交流程以已跟踪 `.agents/README.md` 为准，本地 ignored `CLAUDE.md` 只作 fork 能力参考；保留 tag-only release |
| `07562b7` | auth files official API 支持 | auth files | high | 保留 fork canonical quota 展示，联调 API |
| `7958915` | disable image generation passthrough | visual config | high | 合并 types/defaults/store/API/UI/tests |
| `d3df9b0` | 简化 Codex additional windows | quota | high | 防止月度误标五小时与空周窗口回归 |

## 吸收结论

- 不建议按上游 dead-code cleanup 直接删除 fork 文件。
- 建议一次候选 merge 到 `v1.18.3`，但冲突按 provider/config/auth-files/toolchain 四个切片解决和验证。
- 唯一显式 skip 为上游新增 `AGENTS.md`；继续使用 fork 已跟踪 `.agents/README.md` 作为稳定治理入口，并吸收 `4af4cf4` 的 CI/tests/package/README 其余内容。
- L02 前必须获得用户对 13 个机械冲突、17 个自动热点、fork 定制保留策略和 `AGENTS.md` skip 的确认。
