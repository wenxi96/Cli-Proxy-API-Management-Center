# 仓库分析

## 仓库与分支

- 仓库：`Cli-Proxy-API-Management-Center`
- 当前分支：`dev`
- 集成分支：`dev`
- 发布分支：`master`
- 上游分支：`upstream/main`
- `origin/main`：`4064b01ac3a67be825495a1da8adf7534790d755`
- `upstream/main`：`4064b01ac3a67be825495a1da8adf7534790d755`
- `origin/dev`：`10cd328283f4d064c50942047e6dffcad1c170ef`
- `origin/master`：`fa1c5e168d0a8798d34393eb0397df1cae4d741c`

## 仓库规则

- 代码类改动：先提交并推送到 `dev`，再合并到 `master` 并推送 `master`。
- `.agents` 治理文档类改动：只提交并推送到 `dev`，不得合入或污染 `master`。
- `master` 稳定发布分支当前树必须保持不包含 `.agents`。

## 检测说明

- 首次 `git fetch --all --tags --prune` 因 GitHub TLS 中断失败。
- 后续按 remote 重试后，`origin` 与 `upstream` 均拉取成功。
- 本轮没有执行候选合并。
