# Execution Surface

Generated at: 2026-05-27T09:59:40Z

This file lists runnable, buildable, or checkable command surfaces discovered from repository evidence. Commands were statically derived during bootstrap and were not executed.

| Intent | Command | Scope | Source | Confidence | Executed | Notes |
|---|---|---|---|---|---|---|
| Install dependencies | `bun install --frozen-lockfile` | repository | `README.md:30`, `.github/workflows/release.yml:32` | confirmed | no | CI uses frozen lockfile. |
| Install dependencies | `bun install` | repository | `CLAUDE.md:29` | confirmed | no | Local development shorthand. |
| Start dev server | `bun run dev` | Vite dev server | `package.json:8`, `README.md:28` | confirmed | no | Opens on Vite default port unless overridden. |
| Build production artifact | `bun run build` | TypeScript + Vite single-file build | `package.json:9`, `README.md:37`, `vite.config.ts:65` | confirmed | no | Outputs `dist/index.html`; release workflow renames to `management.html`. |
| Preview production build | `bun run preview` | local preview server | `package.json:10`, `README.md:46` | confirmed | no | Serves built artifact locally. |
| Lint source | `bun run lint` | repository TypeScript/TSX lint | `package.json:11`, `eslint.config.js:7` | confirmed | no | ESLint warnings can exist because rules include warnings. |
| Format source | `bun run format` | `src/**/*.{ts,tsx,css,scss}` | `package.json:12` | confirmed | no | Mutating command; not a verification command unless formatting changes are intended. |
| Type check | `bun run type-check` | TypeScript no-emit check | `package.json:13`, `tsconfig.json:14` | confirmed | no | Separate from `bun run build`, which also runs `tsc`. |
| Release build workflow | tag push matching `v*` | GitHub Actions release | `.github/workflows/release.yml:3`, `.github/workflows/release.yml:35` | confirmed | no | External side effect; do not trigger without explicit authorization. |
| Database migration / seed | none detected | not applicable | repository discovery | confirmed | no | Frontend-only repository; no DB tooling detected. |
| Test suite | none detected | not applicable | `package.json:7`; test file discovery returned none | confirmed | no | No `test` script or test config found. |
