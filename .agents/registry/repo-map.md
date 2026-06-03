# Repository Map

Generated at: 2026-05-27T09:59:40Z

| Path | Category | Role | Importance | Confidence | Evidence |
|---|---|---|---|---|---|
| `.` | package | Single package root for the Web UI. | critical | confirmed | `package.json:1`, `README.md:136` |
| `src/` | app | React application source root. | critical | confirmed | `tsconfig.json:28`, `src/main.tsx:23` |
| `src/main.tsx` | app | React root mount and global browser setup. | critical | confirmed | `src/main.tsx:1`, `src/main.tsx:23` |
| `src/App.tsx` | app | Hash router root, protected app shell, theme/language initialization. | critical | confirmed | `src/App.tsx:20`, `src/App.tsx:37` |
| `src/router/` | app | Authenticated route definitions and route protection. | critical | confirmed | `src/router/MainRoutes.tsx:13`, `src/router/ProtectedRoute.tsx` |
| `src/pages/` | app | Page-level UI for dashboard, config, auth files, OAuth, quota, logs, and system. | high | confirmed | `src/router/MainRoutes.tsx:14` |
| `src/features/providers/` | app | Provider workbench, provider forms, adapters, and resource panels. | high | confirmed | `src/router/MainRoutes.tsx:18`, `src/features/providers/ProvidersWorkbenchPage.tsx` |
| `src/features/authFiles/` | app | Auth file hooks, state, cards, and modal workflows. | high | confirmed | `README.md:82`, `src/features/authFiles/hooks/useAuthFilesData.ts` |
| `src/components/config/` | app | Visual config editor, source editor, diff modal, and config sections. | high | confirmed | `README.md:77`, `src/components/config/VisualConfigEditor.tsx` |
| `src/components/ui/` | library | Shared UI primitives such as button, modal, table, sheet, select, skeleton. | high | confirmed | file discovery under `src/components/ui/` |
| `src/services/api/` | library | Management API client modules and transformers. | critical | confirmed | `src/services/api/client.ts:15`, `README.md:15` |
| `src/services/storage/` | library | Browser storage helpers for local sensitive state. | high | confirmed | `README.md:125`, `src/services/storage/secureStorage.ts` |
| `src/stores/` | library | Zustand stores for auth, config, language, models, quota, theme, and notifications. | high | confirmed | `README.md:92`, file discovery under `src/stores/` |
| `src/i18n/` | library | i18next setup and locale JSON files. | high | confirmed | `README.md:100`, `src/i18n/index.ts` |
| `src/styles/` | library | Global SCSS, reset, layout, themes, variables, mixins. | high | confirmed | `vite.config.ts:59`, file discovery under `src/styles/` |
| `src/types/` | library | Shared TypeScript domain types. | high | confirmed | file discovery under `src/types/` |
| `src/utils/` | library | Shared helpers for auth index, connection, headers, downloads, quota, and formatting. | high | confirmed | file discovery under `src/utils/` |
| `vite.config.ts` | infra | Vite build config, single-file output, aliases, CSS modules, SCSS prelude. | critical | confirmed | `vite.config.ts:39`, `vite.config.ts:65` |
| `package.json` | infra | Package manager, scripts, dependencies, and dev dependencies. | critical | confirmed | `package.json:6`, `package.json:7` |
| `tsconfig*.json` | infra | TypeScript compiler configuration. | high | confirmed | `tsconfig.json:2`, `tsconfig.app.json:2` |
| `eslint.config.js` | infra | ESLint configuration for TypeScript and React hooks. | high | confirmed | `eslint.config.js:7`, `eslint.config.js:20` |
| `.github/workflows/release.yml` | infra | Tag-triggered release build and GitHub release asset publishing. | high | confirmed | `.github/workflows/release.yml:3`, `.github/workflows/release.yml:60` |
| `.agents/tasks/20260527-sync-upstream/` | governance | Upstream sync task authority, findings, implementation plan, progress, handoff, and evidence. | high | confirmed | `.agents/tasks/20260527-sync-upstream/task.md:1`, `.agents/tasks/20260527-sync-upstream/findings.md:1` |
| `README.md` | docs | Product overview, usage, commands, tech stack, release notes, security notes. | high | confirmed | `README.md:3`, `README.md:136` |
| `CLAUDE.md` | docs | Local repository rules and fork-specific constraints. Ignored by Git. | high | confirmed | `CLAUDE.md:7`, `.gitignore:11` |
| `logo.jpg` | app | Application logo asset used indirectly through generated inline logo source. | medium | inferred | root file discovery, `src/assets/logoInline.ts` |
