# 冲突解决报告

## 合并信息

- 合并方式：在隔离 worktree 执行 `git merge --no-commit --no-ff d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`。
- 评审与合并目标：`upstream/main@d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`，对应 `v1.18.3`。
- 候选基线：`dev@878b4d75ed832fd61cb9b87c4a05722733937ed8`。
- MERGE_HEAD：`d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`。
- 候选分支：`codex/frontend-upstream-v1-18-3-absorption`。
- 漂移检查：`origin/main == upstream/main == MERGE_HEAD`。
- 显式排除：上游新增根 `AGENTS.md` 未进入候选；同提交的 CI、tests、package 和 README 继续吸收。

## 冲突处理

| 文件 | 解决原则与实际处理 | 验证 |
|---|---|---|
| `bun.lock` | 删除冲突 lock 后使用 Bun 1.3.14 按最终 `package.json` 全量重建。 | install/verify/build 解析成功。 |
| `package.json` | 吸收上游依赖与 `test`/`verify`，保留 fork `test:usage` 和图表依赖。 | `bun run verify`、`bun run type-check`。 |
| `src/components/ui/icons.tsx` | 吸收上游 Logs alias，同时保留 Usage 所需 `IconDiamond`、`IconTrendingUp`。 | type-check、build。 |
| `BaseProviderForm.tsx` | 采用上游折叠式 `ApiKeyEntriesEditor`，保留 API Key 回显、DisplayName 和 fork provider 字段。 | provider API key tests、浏览器既有回显检查。 |
| `src/hooks/useVisualConfig.ts` | 采用上游 latest-server-snapshot 与 dirty-only merge，保留 quota threshold、scoped pool 和未知字段。 | visual config concurrency tests。 |
| 四个 locale JSON | 合并三类校验文案与 fork 文案；修正俄语文件中的遗留英语文案。 | lint、build、JSON 解析。 |
| `src/services/api/config.ts` | 保留 fork config 能力并吸收上游 API 变化；后续由最终 config store 入口承载。 | type-check、相关测试。 |
| `src/stores/index.ts` | 保留 quota、batch、usage store exports，吸收上游 store 清理。 | type-check、build。 |
| `src/stores/useConfigStore.ts` | 吸收上游精简逻辑，同时保护 fork config 与并发更新入口。 | visual config concurrency tests。 |
| `src/types/visualConfig.ts` | 合并上游字段与 fork quota/scoped-pool 类型。 | type-check。 |

## 合并后兼容修复

- 恢复 `ApiClient.requestRaw`，保护 ZIP POST 下载。
- 恢复 `desktop` SCSS mixin 和 Usage 图标。
- xAI auth-file quota view 增加 weekly/product/on-demand/monthly，并避免 on-demand plan/row 重复。
- API Key edited-state 进入表单提交模型：显式清空不回填旧 key，多 key 删除/新增不按旧索引复用。
- OpenAI 禁用/删除每次读取最新 `/config`，以 `name + index` 拒绝 stale selector；普通入口与 sponsor toggle 均已更新。
- ESLint 10 caught error 使用 `cause`，`tsconfig` 增加 `ES2022.Error`。
- CI 覆盖 `main/master/dev`，release build 使用 `bun run verify`。

## 结果

- 13 个冲突文件全部解决；候选索引无 unresolved entries。
- 根 `AGENTS.md` 不存在。
- linked worktree 的 `.agents` 与 `.aw-task-binding.json` 未暂存。
