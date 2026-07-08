# 2026-07-03 前端合并候选自评审

## 评审状态

- workflow.operation.name: pre_landing_review
- workflow.operation.status: completed
- workflow.review_scope.status: complete
- workflow.findings.status: none
- workflow.verification.status: pass

## 评审边界

- 基线： 合并前 `dev@0a44eb2`
- 候选： 当前工作区中 `git merge --no-commit --no-ff upstream/main@e9817a8` 产生的前端 staged merge 候选，以及手工解决后的两个 VisualConfig 冲突文件
- 评审目标： `pre_merge_absorption_review`

## 范围检查

本次前端候选吸收上游 `v1.17.8` 相关改动：

- Antigravity User-Agent builder
- Auth Files WebSockets provider 扩展
- Plugin Store authentication 配置、安装版本选择、source error 展示、平台/认证状态字段
- VisualConfig 中 `plugins.store-auth` dirty-only 写回逻辑

Fork 侧必须保留的能力仍在候选中：

- DisplayName 相关改动未被删除。
- Auth Files Batch Check 相关文件未被上游覆盖删除。
- scoped pool / Scoped Poll 字段、配置 UI、解析和写回逻辑仍存在。
- 多选 zip 下载相关功能未被本次上游改动覆盖。
- fork CI/Release 文件未被本次前端 merge 候选触碰。

## 冲突解决评审

### `src/types/visualConfig.ts`

- 已同时保留 `VisualScopedPoolProviderEntry` 与上游 `PluginStoreAuthRule`。
- `VisualConfigValues` 同时包含 `pluginStoreAuth`、`quotaAutoDisableAuthFile*`、`routingScopedPool*`。
- `DEFAULT_VISUAL_VALUES` 同时包含 `pluginStoreAuth: []` 与 scoped pool 默认值。

### `src/hooks/useVisualConfig.ts`

- 已保留 fork 的 `areScopedPoolProviderEntriesEqual`、`parseScopedPoolProviderEntries`、`inferScopedPoolEnabled`、`serializeScopedPoolProviderEntriesForYaml`。
- 已吸收上游 `arePluginStoreAuthRulesEqual`、`parsePluginStoreAuthRules`、`serializePluginStoreAuthForYaml`。
- 已保留 fork 的低额度自动禁用解析与 YAML 写回。
- 已吸收上游 `const shouldWritePluginStoreAuth = dirtyFields.has('pluginStoreAuth')`，仅在用户实际修改 plugin store auth 时重写 `plugins.store-auth`。

## 验证证据

- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .`：无输出。
- `git diff --check`：通过。
- `npm run build`：通过，包含 `tsc && vite build`。
- `npm run lint`：通过。
- `git ls-files dist --error-unmatch`：`dist` 未被 Git 跟踪，构建产物未纳入候选。

## 发现问题

未发现需要修复的实质问题。

## 剩余风险

- 当前环境无 `bun` 命令，验证使用已有 `node_modules` 的 `npm run build` / `npm run lint` 等价执行。
- 未启动浏览器做真实 UI 交互验证；本轮证据覆盖 TypeScript、Vite 构建、ESLint、冲突解决和静态 diff 审查。
- 自评审发生时合并仍处于候选阶段；后续已按用户授权把 `.agents` 治理记录一并纳入提交与发布收口。
