# P02 frontend verification review

- Packet ID: P02-frontend-verification-review
- Loop ID: L02-review
- Assigned Worker: frontend-verification-reviewer
- Objective: 独立审查前端验证路径、停止条件、执行面风险和 L03/L04 计划是否足以证明吸收成功且不覆盖 fork 定制。
- Write Scope: None
- Stop Conditions: 发现验证需要外部凭证、需要发布/推送、无法读取必要文件、或验证结论必须依赖未授权资源。
- Workspace Contract: canonical `.agents` path is `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents`; execution surface is main worktree; worker may write only its final submission to `coordination/L02-review/workers/frontend-verification-reviewer/submissions/P02-frontend-verification-review/S01.md` if explicitly asked by coordinator.
- Authority Boundary: reviewer output is evidence material only; coordinator owns board/state/progress/handoff updates.
- Expected Output: Independent review report using the required schema: Review Status; Review Scope; Scope Check; Findings; Scorecard; Verification Evidence; Open Questions / Limitations; Recommended Next Step.

## Request Mode

same_tool_child_session

## Reviewer Selection

Default same-tool child-session reviewer, because the host exposes `codex exec` and this is a pre-code-change verification review.

## Reviewer Capability Probe

- Checked available binaries: `codex`, `claude`, `gemini`, `opencode`.
- Selected capability category: same_tool_child_session via `codex exec`.
- Dispatch sandbox policy: read-only.
- If dispatch fails, coordinator records the packet as not completed and does not claim independent verification review.

## Reviewer Model Policy

Use the Codex CLI default model observed in this environment (`gpt-5.5`), because explicit `-m gpt-5` dispatch returned provider 404 in the backend review flow.

## Dispatch Receipt

Not Sent

## Review Objective

Assume the planned frontend validation will be insufficient. Identify missing commands, missing UI/manual checks, unverified fork customizations, or sequencing risks before L03 code merge begins.

## Candidate Scope

- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260626-frontend-upstream-v1-17-7/findings.md`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260626-frontend-upstream-v1-17-7/plans/2026-06-26-frontend-upstream-v1-17-7-implementation-plan.md`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/.agents/tasks/20260626-frontend-upstream-v1-17-7/task-charter.md`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/package.json`
- `/home/cheng/git-project/Cli-Proxy-API-Management-Center/CLAUDE.md`

## Author Claims

- Required validation is `bun run type-check`, `bun run lint`, and `bun run build`.
- Manual checks must cover DisplayName, Auth Files Batch Check, Scoped Poll, ZIP download, and release policy.
- No push/tag/release/upload is allowed without explicit user authorization.

## Required Evidence

- `package.json`
- `CLAUDE.md`
- Task plan verification sections.
- Existing tests/scripts if present.
- Relevant files for manual check feasibility:
  - `src/pages/AuthFilesPage.tsx`
  - `src/features/providers/components/ProviderResourceTable.tsx`
  - `src/features/providers/sheets/ResourceDetailView.tsx`
  - `src/services/api/config.ts`
  - `src/services/api/transformers.ts`

## Review Type

plan

## Allowed Skills

- aw-review
- aw-plan-eng-review
- aw-verification-before-completion

## Forbidden Actions

- Do not modify files.
- Do not run package installation, merge, commit, push, tag, release, upload, or long-running builds/tests.
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

- Typecheck/build success alone does not prove fork UI workflows remain intact.
- `bun install --frozen-lockfile` may be needed only if dependency state is stale or package/lock changes require it.
- Manual UI checks may need a dev server after code merge; L02 should verify this is represented before L03/L04.
