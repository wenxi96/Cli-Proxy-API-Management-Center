# 前端上游 v1.17.8 合并吸收任务收口

## 当前状态

前端合并吸收任务已完成到“已合并候选、已解决冲突、已验证、已自评审、未提交”状态。

- 当前分支：`dev`
- 吸收目标：`upstream/main@e9817a8` / `v1.17.8`
- 当前方式：`git merge --no-commit --no-ff upstream/main`
- 提交状态：未提交
- 推送状态：未推送
- 发版状态：未发版

## 已完成范围

已吸收上游前端改动：

- Antigravity User-Agent builder。
- Auth Files WebSockets provider 扩展。
- Plugin Store authentication 配置与安装版本选择。
- Plugin Store source error 展示、平台/认证状态字段。
- VisualConfig 中 `plugins.store-auth` dirty-only 写回逻辑。

治理记录已落地：

- `task.md`
- `findings.md`
- `progress.md`
- `handoff.md`
- `closeout.md`
- `evidence/20260703-frontend-merge-verification.md`
- `evidence/20260703-frontend-self-review.md`

## 冲突解决

实际冲突文件：

- `src/hooks/useVisualConfig.ts`
- `src/types/visualConfig.ts`

解决原则：

- 保留 fork 的低额度自动禁用字段、解析、dirty 判断和 YAML 写回。
- 保留 fork 的 scoped pool 字段、配置 UI、解析、dirty 判断和 YAML 写回。
- 吸收上游 plugin store auth 类型、解析、比较、序列化和 dirty-only YAML 写回。

## 验证

已执行并通过：

```bash
npm run build
```

```bash
npm run lint
```

```bash
git diff --check
rg -n "^(<<<<<<<|=======|>>>>>>>)" .
```

补充说明：当前环境没有 `bun` 命令，因此使用已有 `node_modules` 的 npm scripts 等价执行 `tsc && vite build` 与 ESLint。

## 评审结果

已完成主线程自评审，未发现需要修复的实质问题。

重点确认：

- VisualConfig 冲突采用并集合并，没有覆盖 fork 的 scoped pool / 低额度配置。
- 上游 `plugins.store-auth` dirty-only 写回已保留，避免未修改时重写 YAML。
- DisplayName、Auth Files Batch Check、Scoped Poll、多选 zip 下载、fork CI/Release 定制未被本次上游合并覆盖删除。

## 剩余工作

需要用户后续明确授权后才能执行：

- 提交当前前端合并候选。
- 推送 `dev` / 合入 `master`。
- 创建或推送 release tag。

## 剩余风险

- 未启动浏览器做真实 UI 交互验证。
- 当前合并候选仍处于工作区，尚未形成 Git commit。
