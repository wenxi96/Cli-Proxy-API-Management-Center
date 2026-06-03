# Verification Commands

Generated at: 2026-05-27T09:59:40Z

Commands are derived from repository evidence and were not executed during governance initialization.

## Smoke

| Command | Scope | Source | Executed | Notes |
|---|---|---|---|---|
| `bun run type-check` | TypeScript no-emit check | `package.json:13`, `tsconfig.json:14` | no | Lowest-cost static correctness check found in repo scripts. |
| `bun run lint` | ESLint static analysis | `package.json:11`, `eslint.config.js:7` | no | Useful smoke check for changed TS/TSX files. |

## Standard

| Command | Scope | Source | Executed | Notes |
|---|---|---|---|---|
| `bun run type-check` | TypeScript no-emit check | `package.json:13` | no | Run before build for quicker failure isolation. |
| `bun run lint` | ESLint static analysis | `package.json:11` | no | Repo script covers TS/TSX files. |
| `bun run build` | Production single-file build | `package.json:9`, `vite.config.ts:65` | no | Runs `tsc && vite build`; validates production bundling. |

## Exhaustive

| Command or Check | Scope | Source | Executed | Notes |
|---|---|---|---|---|
| `bun run build && bun run preview` | Production artifact served locally | `package.json:9`, `package.json:10`, `README.md:46` | no | Follow with browser verification for touched workflows. |
| Manual UI verification against a compatible CLI Proxy API backend | Dashboard, config, providers, auth files, OAuth, quota, logs, system | `README.md:74`, `README.md:128` | no | Required for behavior that depends on live backend support. |
| Fork customization checklist | DisplayName, auth files batch check, scoped poll, zip download, CI/release behavior | `CLAUDE.md:11`, `.agents/tasks/20260527-sync-upstream/task.md:16` | no | Required after upstream sync or changes touching listed areas. |

## Derivation Order

1. `package.json` scripts are the primary command source.
2. `README.md` development and build sections confirm public developer commands.
3. `.github/workflows/release.yml` confirms CI release build commands and Bun version.
4. `CLAUDE.md` and `.agents/tasks/20260527-sync-upstream/task.md` provide fork-specific verification requirements.
5. Repository discovery found no test script, test config, migration, seed, or backend runtime command.

## Command Sources

- `package.json:7`
- `README.md:28`
- `README.md:37`
- `README.md:136`
- `.github/workflows/release.yml:27`
- `.github/workflows/release.yml:35`
- `CLAUDE.md:27`
- `.agents/tasks/20260527-sync-upstream/task.md:16`

## Known Gaps

- No automated unit, component, or end-to-end test command was discovered.
- Backend-dependent behavior requires a live CLI Proxy API instance and appropriate management key; this bootstrap did not connect to a backend.
- UI regression coverage for fork customizations is currently manual unless separate tests are added later.
