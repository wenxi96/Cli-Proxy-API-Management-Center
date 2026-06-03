# 同步上游 upstream/main → fork master

## 目标

将 upstream/main（`87702bb`）吸收到 fork master 分支，保留全部 fork 自定义功能不丢失。

## 范围

- 合并基点：`808f44d`
- 候选 commit：70 个（`dev..upstream/main` 实测）
- 跳过 commit：15 个（2026-05-15 之前，沿用先前忽略决策，详见 `findings.md`）
- 本次吸收范围：按 `evidence/commit-scope-review-2026-05-29.md` 的逐项复核结果选择性吸收，不使用普通 `git merge upstream/main` 间接吸收跳过项
- 工作分支：`chore/sync-upstream-2026-05-26`（基于 master；当前 `dev` 与 `master` 均为 `fac0e6f`）

## 约束

1. Fork 自定义功能必须完整保留：
   - DisplayName（凭证展示名 + 卡片标题）
   - Auth Files Batch Check 增强（tiered 选择模态、persist 跨页、mobile 可达、insights）
   - 范围轮询（Scoped Poll）总开关与展示
   - 认证文件多选压缩下载
   - CI/release（仅 tag 触发、fork 后缀）
2. DisplayName 采用方案 A：吸收上游新 provider 架构，在新组件中重建 displayName 字段
3. 冲突解决以 fork 定制为主，上游新功能在 fork 结构上叠加
4. 之前忽略的 15 个 commit 继续忽略；若执行路径会间接吸收这些 commit，必须停下改用选择性 replay/cherry-pick 或等价手动补丁方式

## 验收条件

- [x] `bun run build` 零错误（2026-05-29 已验证：`npm run build` 成功）
- [ ] DisplayName 在 Claude/Codex/Gemini/Vertex 凭证编辑可输入并保存（需手动验证）
- [ ] Provider 卡片/详情标题优先展示 DisplayName（需手动验证）
- [ ] Auth Files 批量检查模态 + tiered 重启选项正常（需手动验证）
- [ ] Auth Files 批量检查结果跨页不丢失（需手动验证）
- [ ] 认证文件多选下载产出压缩包（需手动验证）
- [ ] VisualConfigEditor 范围轮询总开关与配置项正常（需手动验证）
- [ ] xAI provider OAuth 登录可走通（需后端支持）
- [ ] 移动端 sidebar、batch check 控件可达（需手动验证）
- [ ] CI 仅 tag 触发构建正式 release（workflow 配置已保留）
