# P01 frontend plan review

- Packet ID: P01-frontend-plan-review
- Loop ID: L02-review
- Assigned Worker: frontend-plan-reviewer
- Objective: 独立审查前端 `dev <- main@acf432b` 吸收计划、提交清单和冲突解决策略是否足以保留 fork 定制并安全进入代码合并。
- Write Scope: None
- Stop Conditions: 发现需要改业务代码、需要 push/tag/release/发布、无法读取必要文件、或结论依赖外部凭证。
- Workspace Contract: canonical `.agents` path is `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents`; execution surface is main worktree; worker may write only its final submission to `coordination/L02-review/workers/frontend-plan-reviewer/submissions/P01-frontend-plan-review/S01.md` if explicitly asked by coordinator.
- Authority Boundary: `task-charter.md` / `ulw-board.md` / `ulw-state.json` remain coordinator-owned; reviewer output is review material only.
- Expected Output: Independent review report using the required schema: Review Status; Review Scope; Scope Check; Findings; Scorecard; Verification Evidence; Open Questions / Limitations; Recommended Next Step.

## Request Mode

same_tool_child_session

## Reviewer Selection

Default same-tool child-session reviewer, because the host exposes `codex exec` and the task requires independent review before code changes.

## Reviewer Capability Probe

- Checked available binaries: `codex`, `claude`, `gemini`, `opencode`.
- Selected capability category: same_tool_child_session via `codex exec`.
- Dispatch sandbox policy: read-only.
- If dispatch fails, coordinator records the packet as not completed and does not treat main-thread review as independent review.

## Reviewer Model Policy

Use the Codex CLI default model observed in this environment (`gpt-5.5`), because explicit `-m gpt-5` dispatch returned provider 404 in the backend review flow.

## Dispatch Receipt

Not Sent

## Review Objective

Assume the frontend absorption plan will fail. Identify the most likely failure paths in the commit absorption matrix, conflict strategy, fork customization preservation, and phase sequencing.

## Candidate Scope

- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260626-frontend-upstream-v1-17-7/findings.md`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260626-frontend-upstream-v1-17-7/plans/2026-06-26-frontend-upstream-v1-17-7-implementation-plan.md`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260626-frontend-upstream-v1-17-7/task-charter.md`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/CLAUDE.md`

## Author Claims

- The plan covers all 27 commits in `dev..main`.
- Known merge conflicts are limited to 7 files: `Select.tsx`, provider table/detail files, `ru.json`, `AuthFilesPage.tsx`, `config.ts`, `transformers.ts`.
- Conflict strategy preserves DisplayName, Auth Files Batch Check, Scoped Poll, ZIP download, and release policy while absorbing APIKEY.FUN, plugin OAuth, reset credits, and status filter updates.

## Required Evidence

- `git -C /home/cheng/git-project/Cli-Proxy-API-Management-Center log --reverse --oneline dev..main`
- `git -C /home/cheng/git-project/Cli-Proxy-API-Management-Center merge-tree --write-tree --name-only dev main`
- Read the 7 conflict files on `dev` and compare relevant upstream changes as needed with `git show main:<path>`.

## Review Type

plan

## Allowed Skills

- aw-review
- aw-plan-eng-review
- aw-verification-before-completion

## Forbidden Actions

- Do not modify files.
- Do not run merge, commit, push, tag, release, deploy, upload, or install commands.
- Do not read secrets, tokens, cookies, or private config.
- Do not write `.agents` authority files.

## Report Schema

Use this exact structure and keep the scorecard lines without bullets:

```text
Review Status
- workflow.operation.name:
- workflow.operation.status:
- workflow.review_scope.status:
- workflow.scope_check.status:
- workflow.findings.status:
- verdict:

Review Scope

Scope Check

Findings

Scorecard
Scope Control: <0-5>
Evidence Quality: <0-5>
Correctness: <0-5>
Safety: <0-5>
Testability: <0-5>
Maintainability: <0-5>

Verification Evidence

Open Questions / Limitations

Recommended Next Step
```

Each finding must include ID, Severity, Summary, Evidence, Impact, Recommendation, Confidence. Verdict must be one of `ready`, `ready_with_updates`, `changes_requested`, `blocked`, `rejected`.

## Known Risks

- `AuthFilesPage.tsx` must combine upstream `statusFilterMode` with fork batch-check and scoped-poll behavior.
- Provider table/detail must preserve fork `displayName` priority while absorbing APIKEY.FUN/openaiCompatibility UI.
- `config.ts` and `transformers.ts` must preserve scoped-pool and low-quota auto-disable fields while absorbing upstream `antigravityCredits`.
