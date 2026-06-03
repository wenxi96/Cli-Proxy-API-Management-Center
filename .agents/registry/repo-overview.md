# Repository Overview

Generated at: 2026-05-27T09:59:40Z

Scan mode: full lightweight bootstrap. Coverage includes root documentation, package/build configuration, CI workflow, source tree structure, and key application entry files. Generated/cache/vendor paths are excluded.

## Repository Summary

This repository is the React + TypeScript + Vite Web UI for operating CLI Proxy API through its Management API. It is a frontend management center only; it does not run the proxy service or forward proxy traffic. Confidence: confirmed. Evidence: `README.md:3`, `README.md:15`, `README.md:16`.

The build produces a single HTML artifact for embedding or release as `management.html`. Confidence: confirmed. Evidence: `README.md:37`, `README.md:44`, `README.md:119`, `vite.config.ts:40`, `.github/workflows/release.yml:35`.

This working copy is a fork with local customizations that must be preserved during upstream sync. Confidence: confirmed from local rule file and active task authority. Evidence: `CLAUDE.md:7`, `CLAUDE.md:13`, `CLAUDE.md:17`, `CLAUDE.md:19`, `.agents/tasks/20260527-sync-upstream/task.md:16`.

## Repository Type

- Frontend single-page application. Confidence: confirmed. Evidence: `README.md:3`, `package.json:22`, `package.json:44`, `src/App.tsx:20`.
- Single-package repository, not a detected monorepo. Confidence: inferred. Evidence: root `package.json:1`; no workspace config was found during bootstrap discovery.

## Primary Languages

- TypeScript / TSX. Confidence: confirmed. Evidence: `package.json:42`, `tsconfig.json:28`, `src/main.tsx:1`.
- SCSS / CSS Modules. Confidence: confirmed. Evidence: `package.json:41`, `vite.config.ts:54`, `vite.config.ts:59`.
- JSON / YAML for package metadata, i18n, and CI workflow. Confidence: confirmed. Evidence: `package.json:1`, `.github/workflows/release.yml:1`, `src/i18n/locales/`.

## Package and Build Systems

- Package manager: Bun `1.3.14`. Confidence: confirmed. Evidence: `package.json:6`, `.github/workflows/release.yml:27`.
- Build system: Vite with React plugin and `vite-plugin-singlefile`. Confidence: confirmed. Evidence: `package.json:9`, `vite.config.ts:1`, `vite.config.ts:40`.
- Type checking: TypeScript strict configuration. Confidence: confirmed. Evidence: `package.json:13`, `tsconfig.json:18`, `tsconfig.app.json:20`.
- Linting: ESLint flat config with TypeScript, React Hooks, and React Refresh rules. Confidence: confirmed. Evidence: `package.json:11`, `eslint.config.js:7`, `eslint.config.js:20`.

## Workspace Roots

- `.`: repository root and package root. Role: package metadata, build config, docs, CI, and static entry HTML. Confidence: confirmed. Evidence: `package.json:1`, `vite.config.ts:39`, `README.md:136`.
- `src/`: application source root. Role: React application, routes, pages, features, services, stores, styles, types, and utilities. Confidence: confirmed. Evidence: `tsconfig.json:28`, `vite.config.ts:51`, `src/main.tsx:5`.

## Main Apps and Services

- Main app: CLI Proxy API Management Center Web UI. Path: `src/`. Purpose: browser UI for dashboard, config, providers, auth files, OAuth, quota, logs, and system pages. Confidence: confirmed. Evidence: `README.md:74`, `src/router/MainRoutes.tsx:13`.
- Main service: none in this repository. This repo consumes an external CLI Proxy API Management API through browser-side HTTP calls. Confidence: confirmed. Evidence: `README.md:15`, `src/services/api/client.ts:15`, `src/services/api/client.ts:34`.

## Key Entry Files

- `index.html`: Vite HTML entry file. Confidence: inferred from Vite convention and root file discovery.
- `src/main.tsx`: React root mount, global styles, document title, favicon setup. Confidence: confirmed. Evidence: `src/main.tsx:1`, `src/main.tsx:23`.
- `src/App.tsx`: Hash router root, protected layout shell, theme and language initialization. Confidence: confirmed. Evidence: `src/App.tsx:20`, `src/App.tsx:37`.
- `src/router/MainRoutes.tsx`: main authenticated route table. Confidence: confirmed. Evidence: `src/router/MainRoutes.tsx:13`.
- `src/services/api/client.ts`: Axios Management API client and request authentication header wiring. Confidence: confirmed. Evidence: `src/services/api/client.ts:15`, `src/services/api/client.ts:98`.
- `vite.config.ts`: build, alias, CSS module, SCSS, single-file output, and version injection configuration. Confidence: confirmed. Evidence: `vite.config.ts:39`, `vite.config.ts:65`.

## Important Operational Files

- `package.json`: package manager, scripts, runtime dependencies, and dev tooling. Confidence: confirmed. Evidence: `package.json:6`, `package.json:7`.
- `bun.lock`: Bun dependency lockfile. Confidence: confirmed. Evidence: file discovery and `git ls-files`.
- `.github/workflows/release.yml`: tag-triggered build and GitHub release workflow. Confidence: confirmed. Evidence: `.github/workflows/release.yml:3`, `.github/workflows/release.yml:35`.
- `.agents/tasks/20260527-sync-upstream/`: current upstream sync task authority, findings, handoff, progress, and implementation plan. Confidence: confirmed. Evidence: `.agents/tasks/20260527-sync-upstream/task.md:1`, `.agents/tasks/20260527-sync-upstream/plans/2026-05-28-sync-upstream-implementation-plan.md:1`.
- `CLAUDE.md`: local repository rules and fork customization constraints. Confidence: confirmed locally, but not git-tracked because `.gitignore` ignores `CLAUDE.md`. Evidence: `CLAUDE.md:1`, `.gitignore:11`.
- `.gitignore`: generated files, logs, local config, and agent scratch/workers ignore rules. Confidence: confirmed. Evidence: `.gitignore:18`, `.gitignore:24`.

## Unknowns

- No automated test command or test configuration was found during bootstrap discovery. Evidence: `package.json:7`; command `find . -maxdepth 2 -type f \( -name '*test*' -o -name '*spec*' -o -name 'vitest.config.*' \) -print` returned no files.
- Backend Management API compatibility is documented as requiring CLI Proxy API `>= 7.1.0`, but this bootstrap did not run against a live backend. Evidence: `README.md:9`.
- `CLAUDE.md` contains important fork rules but is ignored by `.gitignore`; whether those rules should be moved into tracked project docs is a governance decision for maintainers. Evidence: `.gitignore:11`, `CLAUDE.md:7`.
