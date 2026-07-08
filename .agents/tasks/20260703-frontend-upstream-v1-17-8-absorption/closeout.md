# 前端上游 v1.17.8 合并吸收任务收口

## 当前状态

前端合并吸收任务已完成到“已提交、已推送、已合入 master、已发版并完成发布后复核”状态。

- 当前分支：`dev`
- 吸收目标：`upstream/main@e9817a8` / `v1.17.8`
- 吸收提交：`dev@69afc30`
- 发布合并：`master@cbe6d0e`
- 推送状态：`origin/dev@75a4d64`；`origin/master@cbe6d0e`
- 发版状态：`v1.17.8-wx-2.9`

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

合并候选阶段已执行并通过：

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

发布后已复核：

- `git ls-remote --heads origin dev master`：远端 `dev` / `master` 指向预期提交。
- `git ls-remote --tags origin v1.17.8-wx-2.9`：tag peel 指向 `master@cbe6d0e`。
- GitHub Build and Release 发布工作流：`completed/success`。
- Release 页面返回 HTTP 200。
- `management.html` 资产返回 HTTP 200，下载大小 `2943789`。

## 评审结果

已完成主线程自评审，未发现需要修复的实质问题。

重点确认：

- VisualConfig 冲突采用并集合并，没有覆盖 fork 的 scoped pool / 低额度配置。
- 上游 `plugins.store-auth` dirty-only 写回已保留，避免未修改时重写 YAML。
- DisplayName、Auth Files Batch Check、Scoped Poll、多选 zip 下载、fork CI/Release 定制未被本次上游合并覆盖删除。

## 剩余工作

无本任务剩余提交、推送或发版工作。

## 剩余风险

- 未启动浏览器做真实 UI 交互验证。
- 任务完成后上游 `main` 已继续前进；后续上游增量应另建吸收任务处理。
