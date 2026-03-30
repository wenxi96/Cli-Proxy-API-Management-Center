# Fork 维护工作流

这个前端 fork 使用与后端一致的分层分支模型，以便把上游同步、前端开发和管理面板发布彻底分开。

## 分支职责

- `main`：上游镜像分支，始终对齐 `upstream/main`
- `master`：fork 的稳定分支，同时也是当前 GitHub 默认分支
- `dev`：集成分支，用来吸收上游更新和已完成的前端功能开发
- `feature/*`：实际开发分支，从 `dev` 拉出，短期存在

## 为什么要这样设计

这套模型把四件事拆开了：

1. 上游前端发布了什么
2. fork 当前认定的稳定管理面板版本是什么
3. 当前正在集成什么
4. 当前还在开发中的内容是什么

这样可以保证 `main` 保持干净，也能把“可发布的 `management.html`”和“仍在开发中的前端页面”彻底分离。

## 每日上游同步

默认分支 `master` 中包含工作流文件 `.github/workflows/sync-upstream.yml`。

这个工作流会：

- 每天北京时间 09:17 运行一次
- 支持手动 `workflow_dispatch`
- 把 `origin/main` 与 `upstream/main` 对齐
- 只允许 fast-forward 更新
- 如果 `main` 上存在 fork 专属提交，则直接失败，不会强制覆盖
- 如果你对 `main` 启用了保护分支，需要允许 GitHub Actions bot 写入或 bypass；否则 `sync-upstream` 会失败

注意：工作流文件放在 `master` 上，但它真正更新的是 `main`。

## 推荐流程

### 1. 让自动化更新 `main`

正常情况下，GitHub Actions 会每天早上自动更新 `origin/main`。

如果需要，也可以在 GitHub Actions 页面里手动触发 `sync-upstream`。

### 2. 把上游更新合并到 `dev`

```bash
git fetch origin main
git checkout dev
git pull origin dev
git merge --ff-only origin/main
```

上游冲突统一在 `dev` 里解决，不要在 `master` 里处理。
这样可以避免把本地过期的 `main` 合进 `dev`。

### 3. 从 `dev` 拉出前端功能分支

```bash
git checkout dev
git pull origin dev
git checkout -b feature/my-ui-change
```

### 4. 功能完成后先回到 `dev`

```bash
git checkout dev
git merge feature/my-ui-change
git push origin dev
```

### 5. 验证通过后再推进到 `master`

```bash
git checkout master
git pull origin master
git merge dev
git push origin master
```

### 6. 仅从 `master` 打发布标签

```bash
git checkout master
git pull origin master
git tag v2026.03.30-fork.1
git push origin v2026.03.30-fork.1
```

仅从已验证的 `master` 提交打发布标签。
当前发布工作流仍会对任何 `v*` 标签触发，因此这是一条维护约定，而不是工作流硬性保护。

## 本地手动同步命令

如果你想手动同步本地上游镜像分支，可以执行：

```bash
git checkout main
git fetch upstream main
git merge --ff-only upstream/main
git push origin main
```

这些命令不依赖额外的 branch-specific git 配置。
如果你希望裸 `git pull` 直接跟踪 `upstream/main`，需要额外手动配置 `branch.main.remote` 与 `branch.main.merge`。

## 与后端仓库的关系

- 这个仓库负责生成 `management.html`
- 后端仓库负责通过 `remote-management.panel-github-repository` 下载并托管该文件
- 如果后端默认指向你的前端 fork，那么这里的 Release 就会成为 `/management.html` 的真实来源

## 维护规则

- 不要直接在 `main` 上开发
- 不要把未完成工作直接放进 `master`
- 只从已验证的 `master` 提交打发布标签
- 当前发布工作流仍会对任何 `v*` 标签触发，因此这是一条维护约定
- `feature/*` 分支尽量保持短生命周期
- 把 `master` 理解为“已验证的前端稳定状态”，而不是“最新上游状态”
