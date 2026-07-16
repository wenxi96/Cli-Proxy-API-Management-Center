# 验证报告

## 环境

- 使用 `oven/bun:1.3.14` Docker 工具链，匹配候选 lock 重建版本。
- 验证对象：当前 staged merge candidate，MERGE_HEAD 为 `d3df9b074ecc8c1161d998d65e09948bcbcaa6ef`。

## 命令

| 命令 | 结果 | 说明 |
|---|---:|---|
| `bun run test` | pass | 94 tests / 21 files，0 fail。 |
| `bun run type-check` | pass | `tsc --noEmit` 通过。 |
| `bun run lint` | pass | ESLint 通过。 |
| `bun run build` | pass | Vite 8 单文件生产构建通过，762 modules。 |
| `bun run verify` | pass | release workflow 同款 `test -> lint -> build` 完整通过。 |
| `git diff --cached --check` | pass | 无空白错误。 |
| 冲突标记扫描 | pass | 排除 `node_modules/dist/.git` 后无匹配。 |
| `git diff --name-only --diff-filter=U` | pass | 无 unresolved index。 |
| `test ! -e AGENTS.md` | pass | 上游新增根规则文件未进入候选。 |
| `git ls-remote --heads origin main` | pass | `origin/main` 指向 `d3df9b07...`。 |

## 行为覆盖

- API Key untouched/replace/clear、多 key 删除后新增和显式清空。
- OpenAI provider stale index 的 patch/delete 拒绝。
- xAI weekly/product/on-demand/monthly quota parity。
- Visual Config dirty-only 并发更新和 fork 字段保留。
- usage token/cache/cost normalization、credential rows 和官方价格表。
- 此前浏览器桌面/移动登录首屏、console 和密钥显示按钮检查已通过；本轮 H01/H02 最终修复由单元测试和静态复评覆盖。

## 未执行项

- GitHub Actions、真实 release asset、生产部署和外部 provider 端到端调用未执行。
- 原因：候选尚未提交、推送、合入 master 或获得发版授权。
- 风险：workflow 与发布资产需在后续授权阶段基于实际 master candidate SHA 继续核验。
