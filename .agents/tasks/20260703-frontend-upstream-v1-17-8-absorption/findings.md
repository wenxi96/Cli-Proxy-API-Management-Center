# 发现记录

## 2026-07-03 初始上游状态

- 定向 `git fetch origin --tags --prune` 与 `git fetch upstream --tags --prune` 成功。
- `git fetch --all --tags --prune` 在旧远端 `legacy-origin` 上失败，错误为 TLS handshake 异常；该旧远端不影响 `origin` / `upstream` 的本次判断。
- `origin/main` 与 `upstream/main` 均为 `e9817a8`。
- `dev...upstream/main` 计数为 `69 4`，表示 fork 侧有 69 个非上游提交，上游侧有 4 个提交需要按 merge 语义吸收。
- `master...upstream/main` 计数为 `74 4`。
- 上游最新标签为 `v1.17.8`，当前 fork 发版标签为 `v1.17.7-wx-2.8`。

## 上游吸收项摘要

1. `3dc365f` 新增 Antigravity client 配置和 User-Agent builder。
2. `07a9c82` 将认证文件详情编辑器的 WebSockets 开关从 Codex 扩展到支持 provider 集合，目前包括 Codex 与 xAI。
3. `e5fd4af` 新增 plugin store authentication 配置、安装版本选择、插件源错误展示和相关 API/type/i18n。
4. `e9817a8` 改进 `useVisualConfig` 中 `plugins.store-auth` 的写回逻辑，只在字段 dirty 时写入，避免未修改时重写配置。

## 冲突摘要

- `git merge-tree --write-tree dev upstream/main` 退出码为 `1`。
- 内容冲突文件：
  - `src/hooks/useVisualConfig.ts`
  - `src/types/visualConfig.ts`
- 冲突原因：fork 在同一批 VisualConfig 类型、默认值、解析、dirty 判断和 YAML 写回逻辑中加入了低额度自动禁用与 scoped pool；上游在同一区域加入了 plugin store auth。
- 建议解决原则：字段并集式合并，保留 fork 的 quota/scoped pool 字段，同时吸收上游 plugin store auth 类型、默认值、解析、dirty 判断和 dirty-only 写回逻辑。

## 需要保护的 fork 能力

- DisplayName。
- Auth Files Batch Check 增强和批量额度展示对齐。
- Scoped Poll / scoped pool 前端配置能力。
- 认证文件多选 zip 下载。
- fork 的 CI/Release 规则与版本后缀。

## 2026-07-03 前端合并验证结论

- 已实际执行 `git merge --no-commit --no-ff upstream/main`，未产生提交。
- 真实冲突与预检一致，仅有：
  - `src/hooks/useVisualConfig.ts`
  - `src/types/visualConfig.ts`
- 冲突解决采用并集合并：
  - 保留 fork 的低额度自动禁用与 scoped pool 字段、解析、dirty 判断和 YAML 写回。
  - 吸收上游 plugin store auth 类型、解析、dirty 判断、序列化和 dirty-only YAML 写回。
- 当前环境没有 `bun` 命令，但已有 `node_modules` 和本地 `tsc`/`vite`；已用 `npm run build` 完成等价构建验证。
- `npm run build` 与 `npm run lint` 均通过。
