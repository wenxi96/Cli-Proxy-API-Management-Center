# Findings

## Confirmed Context

- The current canonical cross-repository task lives in the backend repository under `/home/cheng/git-project/CLIProxyAPI/.agents/tasks/20260612-sync-upstream-v7-fork-customizations/`.
- The previous frontend task `20260527-sync-upstream` targeted `upstream/main@87702bb` and is now a predecessor/reference only.
- The current frontend baseline is `upstream/main@b0db1dfd5da5` / `v1.16.7`.
- The current frontend work preserves Usage functionality on top of the newer upstream layout instead of directly applying the old skipped usage commits.

## Usage Scope

- Usage page files are part of the current cross-repository task scope.
- The old `b25f722` / `632be0b` `continue_skip` decisions remain useful as historical audit evidence, but they do not prohibit the current `v1.16.7` Usage preservation work.
