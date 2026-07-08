# Findings

## 远端状态

- `origin/main` 与 `upstream/main` 当前均为 `4064b01ac3a67be825495a1da8adf7534790d755`。
- `dev` 与 `origin/dev` 当前均为 `10cd328283f4d064c50942047e6dffcad1c170ef`。
- `master` 与 `origin/master` 当前均为 `fa1c5e168d0a8798d34393eb0397df1cae4d741c`。
- 上游最新标签为 `v1.17.10`。

## 更新范围

- `git rev-list --left-right --count dev...upstream/main`：`77 0`。
- `git log --reverse --format='%h%x09%s' dev..upstream/main` 无输出。
- 当前没有新的上游提交需要吸收。

## 冲突预检

- `git merge-tree --write-tree dev upstream/main` 返回合成树 `fc4aa8d5fe26170ff12dcddd6f105ee56d84dea6`。
- 命令未输出冲突明细。

## 授权边界

- 本轮未执行合并、提交、推送、合入 `master` 或发版。
