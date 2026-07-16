# 评审报告

## 评审范围

- 候选范围：`dev@878b4d75 + MERGE_HEAD@d3df9b07`，共 145 个业务文件。
- 重点模块：provider 表单与 API、Auth Files quota、Visual Config、plugin store、usage、CI/release、类型与依赖。
- 排除范围：提交、推送、master 合入和发版动作尚未授权和执行。

## Round 1 Findings

| ID | 严重级别 | 问题 | 处理 | Disposition |
|---|---|---|---|---|
| FE-H01 | High | API Key edited-state 只在组件本地，清空可能回填旧 key；删除中间项后新增项可能按旧索引复用错误 key。 | 将 edited-state 放入单 key/多 key 表单模型；显式编辑清除 `existingApiKey`；构建 payload 时仅未编辑项允许 existing fallback；移除数组索引 fallback；增加回归测试。 | `fixed` |
| FE-H02 | High | OpenAI Compatibility 禁用/删除使用过期索引，配置并发插入或重排时可能误操作其他 provider。 | 每次 mutation 读取最新 `/config`；校验 `name + index`；不匹配时拒绝并要求刷新；修复普通入口和 sponsor toggle；增加并发测试。 | `fixed` |
| FE-M01 | Medium | xAI on-demand 启用时 plan 与 row 重复。 | 仅在 `onDemandCap <= 0` 时生成 disabled plan item，启用时只保留 row；补充 parity 断言。 | `fixed` |
| FE-M02 | Medium | CI 未覆盖 master，release 未执行完整 verify。 | CI branches 增加 master；release build 改为 `bun run verify`。 | `fixed` |

## Round 2 独立复评

- Reviewer：Hypatia（只读独立 reviewer）。
- 结论：`No findings`，`ready`。
- H01：确认 edited-state、显式 clear、replace、删除后新增均闭环。
- H02：确认 patch/delete helper、最新 config、普通入口与 sponsor toggle 均使用 `name + index`。
- M01：确认 xAI plan/row 不重复。
- M02：确认 CI 覆盖 `main/master/dev`，release 使用 `bun run verify`。

## 主线程复核

- 搜索所有 `updateOpenAIProviderDisabled` 与 `deleteOpenAIProvider` 调用，无旧签名遗漏。
- 根 `AGENTS.md` 已排除，候选无 unstaged tracked diff。
- 无 unresolved index、空白错误或冲突标记。
- 未发现新的 high/medium/low/nit 问题。

## 结论

- 阻断问题：无。
- 最后一轮无新增 finding：是。
- 未处理 high/medium：无。
- 剩余风险：真实 GitHub workflow、发布资产和 provider 外部交互需在后续授权阶段验证。
