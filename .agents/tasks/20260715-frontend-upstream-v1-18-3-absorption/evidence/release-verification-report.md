# 前端发布核验报告

## Release Candidate

- master：`7f1fd2eb622d8ad9cd1f45c8bed7257238d9d4fa`。
- tag：`v1.18.3-wx-2.13`，远端精确指向 master。
- `scripts/version.sh auto-release`：`BASE_TAG=v1.18.3`、`EFFECTIVE_CUSTOM_VERSION=2.13`。
- master `.agents`：空。

## Actions 与 Release

- Build and Release：run `29498962165`，`success`。
- Release：https://github.com/wenxi96/Cli-Proxy-API-Management-Center/releases/tag/v1.18.3-wx-2.13
- Release 状态：非 draft、非 prerelease。

## 资产核验

- 资产：`management.html`。
- GitHub size：`3,232,149` 字节。
- GitHub digest：`sha256:04b5b4b5b56e8c925744477de1401f4b1397be3dbe4df6ead84386d8c0f08e61`。
- 实际下载 size 与 SHA-256 均与 GitHub 元数据一致。

## 结论

前端 tag、workflow、Release 和 `management.html` 资产完整核验通过。
