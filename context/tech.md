# SlotWise technology

## Status

Feature 000 installed the foundation on 2026-11-12. Feature 001 added local authentication on 2026-11-13; later-feature libraries remain planned. Actual versions and checks are recorded below. The proposal's Next.js 15 is not a version requirement. Keep a compatible non-prerelease dependency set and one npm lockfile; follow a course-mandated major if one is supplied later. Git is initialized on `main` with origin `https://github.com/rajveer3x/slotwise.git`; the initial README commit is pushed, and foundation/auth source is included in the subsequent local feature commit.

## Selected implementation defaults

| Concern | Default | Reason |
| --- | --- | --- |
| Framework | Next.js App Router, React, TypeScript strict mode | Course focus; one full-stack application |
| Styling | Tailwind CSS, shadcn/ui primitives, Lucide icons | Consistent reusable interface |
| Design system | Semantic tokens and layouts in ui-ux.md; Inter or system font | Warm neutral scheduling workspace with blue actions |
| Validation/forms | Zod; React Hook Form for complex forms | Shared input shape, server validation remains mandatory |
| Database | PostgreSQL with Prisma | Relationships, migrations, transactions |
| Authentication | Auth.js with credentials for local demo | Server sessions and role enforcement; verify selected-version integration |
| Password hashing | Argon2id with maintained library | Never store plaintext passwords |
| Scheduling grid | CSS Grid; dnd-kit when feature 003 needs it | Custom interaction and keyboard alternatives |
| Charts | Recharts when feature 009 needs it | Workload and impact visualization |
| Tests | Vitest, React Testing Library, Playwright | Domain, UI, integration and browser flows |
| Package manager | npm with one package-lock.json | Straightforward student workflow |
| Local database | Docker Compose PostgreSQL | Repeatable local setup |

Do not install every optional library during foundation. Begin with framework, styling, validation, database and test tooling; add auth and interaction packages with their features. Choose the Auth.js session strategy supported by the selected credentials integration and document it in feature 001. Resolve active user roles from the database for privileged operations so stale session claims do not grant permissions.

## Keep infrastructure small

UI styling follows [ui-ux.md](ui-ux.md), including token colors, responsive layouts, accessible controls and reduced motion. Start with CSS transitions. Animmaster Lib, Skiper UI and Vengeance UI are optional design/component references, not selected package dependencies. Do not install them during foundation. Before adopting an exact example, verify its source, reuse terms, dependencies and compatibility, adapt it to project primitives, and record the source and checks below. CSS/shadcn remains the fallback; no paid component is required. Do not add multiple animation runtimes or client-render an entire layout for a decorative effect.

Use Server Components for initial database reads and Client Components for interaction. Use Server Actions for first-party form mutations; Route Handlers for auth callbacks and optional file feeds. Do not introduce TanStack Query, FullCalendar, Redis, BullMQ, or SSE unless a selected feature establishes the need. Core notifications can refresh on navigation and after mutations; label them in-app, not instant push.

Use a small deterministic TypeScript recommendation engine over bounded demo data. If runtime limits are reached, report incomplete results rather than pretending the search is exhaustive. Feature 012 introduces durable background work only if generation needs it. Python/FastAPI/OR-Tools is deferred.

## Environment

Foundation uses `DATABASE_URL` plus Compose's `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. `.env.example` contains local-only placeholders; real `.env*` files are ignored. Compose binds `127.0.0.1:5433` to the container's 5432. `AUTH_SECRET`, `NEXTAUTH_URL` (the v4 canonical URL), `DEMO_SEED_PASSWORD` and isolated `TEST_DATABASE_URL` are used by feature 001. Examples contain no auth or seed secrets. No server secret may use the `NEXT_PUBLIC_` prefix.

Pin a compatible Node.js LTS in the project runtime file. Record package/runtime versions from installed metadata, not assumptions.

## Planned scripts

Foundation should establish `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `db:generate`, `db:migrate`, and `db:seed` where applicable. A script with no tests must not be reported as successful test coverage. Avoid creating commands that silently reset data.

Use an isolated test database for integration tests. Record commands requiring Docker or database access and explain when unavailable. Hosted deployment is a later user decision; do not claim the app is deployed or assume any provider has a free tier.

## Installed versions and verified commands

Verified from installed metadata with `npm ls --depth=0`, running with Node 24.22.3 and npm 11.17.0:

| Concern | Installed version |
| --- | --- |
| Node.js / npm | 24.22.3 / 11.17.0 |
| Next.js / React / React DOM | 16.4.6 / 19.3.1 / 19.3.1 |
| TypeScript | 5.9.3 |
| Tailwind / Tailwind PostCSS | 4.3.5 / 4.3.5 |
| Prisma CLI / client / PostgreSQL adapter | 7.10.1 / 7.10.1 / 7.10.1 |
| PostgreSQL / pg driver | 17.11 (`postgres:17-alpine`) / 8.23.1 |
| Zod / dotenv | 4.6.7 / 17.4.2 |
| Lucide React / server-only | 0.577.0 / 0.0.1 |
| Vitest / React Testing Library / jsdom | 5.1.0 / 16.3.3 / 29.1.1 |
| Playwright / axe Playwright | 1.65.0 / 4.14.0 |
| ESLint / Next ESLint configuration | 9.39.5 / 16.4.6 |
| tsx | 4.23.15 |
| NextAuth.js (Auth.js v4) / Argon2 | 4.24.15 / 0.45.2 |

Compatibility checked against [Next installation requirements](https://nextjs.org/docs/app/getting-started/installation), [Prisma 7 requirements](https://www.prisma.io/docs/orm/v7/reference/system-requirements), [Prisma client generation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client), [PostgreSQL adapter setup](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql) and [Node LTS releases](https://nodejs.org/en/about/previous-releases), together with npm package engine/peer metadata. Prisma's npm default was `8.0.0-rc.33`; explicitly selected stable 7.10.1. `.nvmrc` pins the compatible Node 24 LTS line; the host's default Node 26.5.0 was not used for verification. Verification selected an isolated Node 24.22.3 in `/tmp/slotwise-node`; users should select `.nvmrc` through their normal Node manager.

Scripts now exist for `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `test:e2e`, `db:generate`, `db:validate`, `db:migrate`, `db:migrate:dev`, `db:check` and `check:client-bundle`. `db:migrate` uses noninteractive `migrate deploy`; `db:migrate:dev` is reserved for development migration authoring. Feature 001 adds explicit `db:seed`, `db:test:migrate` and `test:integration` scripts. See README for exact commands and progress.md for actual results.

Implementation notes:

- Public landing/login remain prerendered Server Components. Feature 001 adds dynamic protected Server Component reads, small interactive forms/shell controls and an authorized Server Action.
- Prisma uses the `prisma-client` generator, ignored output under `src/generated/prisma`, `prisma.config.ts`, and `@prisma/adapter-pg`. The initial migration establishes the public schema; feature 001 adds Department/User/Role and normalized email storage constraints. `db:check` verifies real connectivity with `SELECT 1` through the shared server-only client.
- `server-only` guards database/environment modules. CLI diagnostics opt into the `react-server` condition; no public health/database route was added. Zod validates the database URL lazily and does not include it in errors.
- Tailwind tokens follow ui-ux.md. System fonts avoid network fetches. Project-owned semantic button/input components are the baseline; shadcn registry components, drag/drop, charts, motion libraries and optional component catalogues are not installed. NextAuth/Argon2 were added only for feature 001.
- Development/build explicitly select Webpack. Turbopack's CSS-worker port binding failed on this host, including an approved retry; Webpack builds and serves successfully. `agentRules: false` stops Next.js from modifying the existing AGENTS.md.
- **Lint maintenance limitation:** the Next preset's React/import/accessibility plugins currently declare ESLint 9 peers; ESLint 10 produced incompatible peer warnings. The working set retains ESLint 9.39.5, which npm marks deprecated/unsupported. A separate ESLint 10 plugin configuration was prepared but its dependency-install approval was declined; the manifest/config were restored to the installed, compatible set. Completing a supported lint-toolchain migration remains unfinished. No further install was attempted after that decline.
- Scoped override `@typescript-eslint/typescript-estree -> minimatch 11.0.8` fixes the development-tooling glob amplification advisory. Final install audit reported zero vulnerabilities; typecheck/lint/tests passed with this override. Recheck it when updating TypeScript ESLint.
- Browser QA used installed Google Chrome via `PLAYWRIGHT_CHANNEL=chrome`. Playwright Chromium installation is documented as an alternative but was not run. Screenshots and automated WCAG scans cover the implemented pages; full assistive-technology testing remains outside those automated claims.

## Feature 001 authentication decisions

- Stable `next-auth@4.24.15` declares Next 16/React 19 peers; `argon2@0.45.2` supports Node 24 and its native binding was verified locally. Installation reported zero audit vulnerabilities. No prerelease auth dependency or Prisma auth adapter was added.
- Credentials require **JWT sessions** in this version; users and Argon2id hashes are explicitly persisted by the development seed. Tokens contain only the user ID (`sub`) and library-managed issuance/expiry fields, never roles or department claims. Sessions have an eight-hour maximum age. Session updates cannot set identity or permissions. The session callback exposes only a current active user's name/email.
- `sessionIdentity` uses the library's `getToken` with awaited Next request headers and explicit secret/cookie-security configuration. `requireSession` reloads the current active user from Prisma; page redirection is isolated in `page-session.ts`. Authorization helpers reject wrong roles and departments, including ADMIN attempting HoD-only work. `/admin` is intentionally a minimal account-access/revocation screen for auth verification, not full master-data or account provisioning CRUD.
- Every access mutation obtains identity from the signed server request, locks actor/target rows in stable ID order, reloads permissions, rejects cross-department/self changes and checks the expected active status before writing. PostgreSQL row locks serialize concurrent access changes and revocation. Other feature services must add their own domain rules; this does not implement scheduling transactions.
- NextAuth's client `signIn`/`signOut` use its double-submit CSRF flow. Auth.js owns HttpOnly/SameSite=Lax session cookies and Secure prefixes for HTTPS. `AUTH_SECRET` must be at least 32 characters; the configured canonical URL must use HTTPS in production except for local loopback QA. Local production-build browser tests use loopback HTTP; deployed HTTPS cookie behavior was not browser-tested.
- `LoginLimiter` reserves an attempt synchronously before database/hash work: five attempts per normalized email per 15 minutes, plus 100 process-wide attempts per minute. Successes count as attempts; counters do not reset on successful login. Keys are hashed and expired entries removed; capacity is bounded and fails closed. It does not trust client-supplied forwarding headers. This in-memory limiter survives development hot reloads but not process restarts, and is unsuitable for multi-instance production. Replace it with shared atomic storage for that deployment.
- Password input is capped at 128 UTF-8 bytes. Argon2id uses 64 MiB, three iterations and parallelism 1. Unknown users verify a process-local random dummy hash; invalid/inactive/throttled credentials receive the same generic UI message. Infrastructure failures receive a safe retry message.
- `db:seed` is explicit, refuses production/missing or short passwords, creates five synthetic `.test` identities, and preserves existing accounts and hashes. It adds no courses, sections or semester data. Faculty profiles and student memberships remain feature 002 scope; feature 001 exposes no teaching/section records. The ignored local `.env` contains generated local-only auth/seed secrets; `.env.example` leaves those values blank.
- Test commands require `TEST_DATABASE_URL` with database path `/slotwise_auth_test`. Migrations are applied without resets; fixtures are uniquely scoped and only those records are cleaned. Browser QA uses two workers and a fresh runtime secret. Tests do not operate on the main demo database.
- Full navigations after login/logout clear any role-specific Router Cache. Hiding navigation never authorizes a service. Existing tabs may show previously rendered content until their next protected request; account revocation is enforced on that request. JWT logout clears the current browser cookie; no durable per-token session registry/global logout is implemented.

Version-specific sources checked during implementation: [v4 credentials constraints](https://next-auth.js.org/providers/credentials), [App Router initialization](https://next-auth.js.org/configuration/initialization), [session/cookie/environment options](https://next-auth.js.org/configuration/options) and [client CSRF flow](https://next-auth.js.org/getting-started/client). Installed package code and peer metadata were also inspected, and the integration was exercised against the production build.

## Reference documentation

- [Next.js App Router](https://nextjs.org/docs/app)
- [React reference](https://react.dev/reference/react)
- [Prisma documentation](https://www.prisma.io/docs)
- [Auth.js documentation](https://authjs.dev/)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

Consult the documentation matching installed versions when implementing APIs; these links do not establish installed compatibility.
