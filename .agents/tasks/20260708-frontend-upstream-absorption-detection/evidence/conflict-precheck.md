# 冲突预检

## 命令

```bash
git merge-tree --write-tree dev upstream/main
```

## 结果

返回合成树：

```text
fc4aa8d5fe26170ff12dcddd6f105ee56d84dea6
```

命令未输出冲突文件或冲突说明。

## 注意事项

- 当前 `dev..upstream/main` 无新增提交，因此无需执行前端吸收合并。
- 原始 `git diff dev..upstream/main` 仍可能显示 fork 定制与治理文件差异；这些不是新增上游提交。
