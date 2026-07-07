# 前端发版核验报告

## 范围

- 仓库：`wenxi96/Cli-Proxy-API-Management-Center`
- 上游基线：`router-for-me/Cli-Proxy-API-Management-Center@v1.17.10`
- 集成分支：`dev`
- 发布分支：`master`
- 发版标签：`v1.17.10-wx-2.10`

## 分支与提交

- `origin/dev`: `cfabc797b5d357f5f40ae586a268680572be6b1b`
- `origin/master`: `6bf3d12c0dbadb614a40d46b9d4911edc1d30034`
- `master` 已包含本次 dev 合并提交：`git branch --contains cfabc797b5d357f5f40ae586a268680572be6b1b --all` 包含 `remotes/origin/master`。

## 发布候选门禁

- 发布 worktree：`~/.agents/worktrees/wenxi96/Cli-Proxy-API-Management-Center/master-v1-17-10-absorption`
- master 发布候选提交：`6bf3d12c0dbadb614a40d46b9d4911edc1d30034`
- 复验命令：
  - `~/.bun/bin/bun install --frozen-lockfile`
  - `~/.bun/bin/bun run lint`
  - `~/.bun/bin/bun run type-check`
  - `~/.bun/bin/bun run build`
  - `git diff --check -- ':!.agents'`
  - `rg -n '^(<<<<<<<|=======|>>>>>>>)' . --glob '!.agents/**' --glob '!dist/**' --glob '!node_modules/**'`
- 结论：复验通过，未发现冲突标记、空白错误、lint/typecheck/build 失败。

## 版本脚本

在实际 master 发布候选 上执行：

```text
bash ./scripts/version.sh auto-release
BASE_TAG=v1.17.10
RELEASE_TAG=v1.17.10-wx-2.10
VERSION=1.17.10-wx-2.10
```

## Tag 核验

- 本地创建轻量 tag：`v1.17.10-wx-2.10`
- 已推送：`git push origin v1.17.10-wx-2.10`
- 远端核验：`git ls-remote --tags origin v1.17.10-wx-2.10` 返回 `6bf3d12c0dbadb614a40d46b9d4911edc1d30034`。

## GitHub 发布

- 发布地址：`https://github.com/wenxi96/Cli-Proxy-API-Management-Center/releases/tag/v1.17.10-wx-2.10`
- 状态：`draft=false`，`prerelease=false`
- 发布者：`github-actions[bot]`
- 资产：`management.html`
- 资产大小：`3017748` 字节
- `management.html` 下载核验：`curl -I -L` 返回 `HTTP/2 200`。

## GitHub Actions 核验

- `Build and Release` run `28850560343`: `completed/success`
- `rebuild-release-history` run `28850437213`: `completed/skipped`，符合该 workflow 的 master push 条件。

## 结论

前端 `v1.17.10-wx-2.10` 发版链路完成，分支、tag、GitHub Release、发布资产和 Actions 均已核验通过。
