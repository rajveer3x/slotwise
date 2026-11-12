# SlotWise progress

Last updated: 2026-11-13

## Verified current state

Features 000 and 001 are implemented and verified locally. Feature 001 adds seeded credential login/logout, current database-backed authorization, five role dashboards and department-scoped account-access administration. Features 002–017 are not implemented. The feature 000 ESLint 9 support limitation remains open; lint still passes. A Git repository now exists on `main` with origin `https://github.com/rajveer3x/slotwise.git`; its initial README commit is pushed. The application source is being committed locally in this handoff. No deployment exists. The records below for feature 000 are historical; the feature 001 handoff at the end describes current behaviour.

## MVP build order

| ID | Feature | Depends on | Status |
| --- | --- | --- | --- |
| 000 | Project foundation | None | Implemented; lint-tooling follow-up unfinished |
| 001 | Authentication and roles | 000 | Complete; local demo verified |
| 002 | Master data and demo fixtures | 001 | Not started |
| 003 | Timetable and clash detection | 002 | Not started |
| 004 | Leave requests and impact preview | 003 | Not started |
| 005 | Explainable resolution engine | 004 | Not started |
| 006 | Substitute response and Saturday approval | 005 | Not started |
| 007 | Change preview and publication | 006 | Not started |
| 008 | Delivery and contact-minutes ledger | 007 | Not started |
| 009 | Workload and impact dashboards | 008 | Not started |
| 010 | Notifications and acknowledgement | 007, 009 | Not started |
| 011 | Audit viewer and demo verification | 010 | Not started |

Specifications are linked from [the feature index](feature-specs/README.md). Follow dependencies even if choosing a different order.

## Optional backlog

012 timetable generator; 013 CSV import/export; 014 makeup voting; 015 calendar feeds; 016 what-if simulator; 017 emergency cover mode. All are not started and outside the default MVP. Python solver, external messaging, PWA offline mode, Excel/PDF, SSO and portal integrations are deferred beyond these specs.

## Decisions and assumptions

- Working name SlotWise; original proposal title Faculvex.
- Course focus React/Next.js; prefer core workflow over two solver implementations.
- `tech.md` is the technology file; no duplicate `text.md`.
- PostgreSQL, Prisma and Tailwind are installed/verified; feature 001 adds stable NextAuth.js v4 and Argon2. tech.md owns installed versions and commands.
- Demo policy and state transitions are documented in domain-rules.md. Keep configurable policy distinct from actual university requirements.
- No real personal or historical university data supplied. All demo metrics must be labelled synthetic.
- Documentation creation is complete; foundation application code now exists. Authentication is implemented; scheduling/product workflows remain pending.
- UI design revision: adapt the supplied Notion marketing reference into SlotWise's warm neutral workspace, readable data layouts and blue action palette. ui-ux.md owns the implementation design; reference-specific instructions and exact marketing measurements are not requirements.
- Animmaster Lib, Skiper UI and Vengeance UI are optional sources. No component package or paid code was installed; project-owned CSS/shadcn primitives remain the baseline. Check the exact component before adoption.

## Open inputs

Deadline, team size, marking rubric, mandated framework versions, hosting target, and institution policy are unknown. These do not block building the local MVP using the explicit defaults. Ask when an input materially affects the selected feature.

## Next action

Stop after feature 001 as requested. Feature 002 (master data and demo fixtures) is next only on a separate request; no teaching profiles, sections, timetable data or later workflow has been implemented. The inherited supported-lint-toolchain migration remains a maintenance item and was not expanded into this auth task.

## Documentation verification

2026-11-12: checked six core context files, 18 consecutively numbered feature specifications, local Markdown link targets, balanced code fences, and required acceptance/check/prompt sections. All checks passed. Reviewed shared policy consistency, including exact-candidate approvals, scheduling versus delivery, and retry handling. These are documentation checks only; no application tests have run because application code does not exist yet.

## UI design context revision — 2026-11-12

- Updated ui-ux.md, tech.md, the common feature contract and specs 000, 003, 005, 007, 009 and 011.
- Specified tokens, typography, responsive shell, screen layouts, timetable interactions, recommendation/publication patterns, motion limits and visual acceptance checks.
- Reviewed the supplied DESIGN.md's palette/type/layout guidance and stated limitations, plus the three component sites' public pages. Skiper's component listing exposed a loading shell, so no exact Skiper component is selected. Vengeance's Animated Button is a possible landing-only enhancement, subject to code checks; a standard button is sufficient.
- Application status remains not started. Documentation validation does not establish that UI is rendered, accessible, installed or tested.
- Verification: local Markdown links and code fences passed; six core context files and 18 feature specs remain. Calculated base text/status color pairs met the specified 4.5:1 target, and the input boundary against white exceeded 3:1. These calculations cover specified base pairs only; rendered hover/focus/selected states, screenshots and browser accessibility checks remain for implementation.

## Handoff record template

For each feature append a compact record:

```text
Feature / date:
Status: not started | in progress | blocked | implemented, unverified | complete
What changed and key paths:
Acceptance criteria met / remaining:
Commands run and actual results:
Manual checks performed:
Known limitations or blockers:
Shared context updated:
Next recommended feature:
```

Do not mark a feature complete if required verification is unavailable or criteria remain unmet. Documentation lint/link checks are not application tests.

## Feature 000 handoff — 2026-11-12

**Status:** application implemented and verified; supported lint-toolchain migration unfinished. No other feature was started.

### What changed

- Added `package.json`, one `package-lock.json`, `.nvmrc`, strict `tsconfig.json`, Next/PostCSS/ESLint/Vitest/Playwright configurations and `.gitignore`.
- Added `src/app/layout.tsx`, `page.tsx`, `(auth)/login/page.tsx`, `not-found.tsx`, `globals.css`, `components/brand.tsx` and basic `components/ui/{button,input}.tsx`.
- Landing uses the specified warm-neutral/blue tokens, a system font stack, responsive layouts, semantic landmarks, a skip link, visible focus, touch-sized actions and reduced-motion support. The three-day schedule is a static, project-authored synthetic illustration. No metrics, real university data or live schedule claims are shown.
- Sign-in leads to a clearly labelled pending experience with a home link; there is no credential form, role switcher, account, auth package or application shell for authenticated users.
- Added placeholder `.env.example`, local-only PostgreSQL `compose.yaml`, `prisma.config.ts`, an empty domain schema and a non-destructive public-schema migration. `src/server/{db,env}.ts` guard server-only imports, validate configuration lazily and share a connection pool. `scripts/check-db.ts` runs read-only Prisma connectivity verification; `scripts/check-client-bundle.mjs` inspects emitted client files.
- Added rendering/environment tests and production-browser navigation, responsive, accessibility and keyboard tests in `tests/`. Replaced README's documentation-only instructions with startup/database/check commands and React/Next.js explanations while retaining kit links. `tech.md` records installed versions, compatibility sources and implementation choices.

### Acceptance and actual checks

All numbered feature acceptance criteria were exercised against the implementation. The separate supported-lint-toolchain requirement has the exception described below, so feature 000 is not marked unconditionally complete.

Commands below ran using Node **24.22.3** selected with `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`; npm was **11.17.0**. The user's normal equivalent is `nvm install && nvm use` in this project. Commands requiring local network, browser processes, Docker access or the production build used approved execution outside the sandbox.

| Command/check | Actual result |
| --- | --- |
| `npm install --no-fund` | Final approved dependency set installed; zero audit vulnerabilities; ESLint deprecation warning remains. |
| `npm ci --offline --cache /Users/raj/.npm --no-fund` | Passed in isolated `/tmp/slotwise-foundation-clean-check`, using a source copy and example environment; installed 600 packages from the lockfile with zero audit vulnerabilities. This verifies clean installation from available cached artifacts, not a second uncached network install. |
| `npm run typecheck` | Passed in the project and isolated clean installation: Prisma client generation, Next route type generation, TypeScript `--noEmit`. |
| `npm run lint` | Passed in both installations with `--max-warnings=0`. |
| `npm test` | Passed in both installations: 9 tests across 2 files, covering page rendering/availability/illustration labels and valid/invalid/missing environment configuration. |
| `npm run db:validate` | Passed: Prisma schema valid. |
| `docker compose up -d --wait db` | Passed: PostgreSQL container healthy; only `127.0.0.1:5433` published. |
| `npm run db:migrate` | Passed: `20261112000000_foundation` applied without resets or domain tables. |
| `npm run db:check` | Passed: real Prisma `SELECT 1` against PostgreSQL. |
| `docker compose exec -T db psql -U slotwise -d slotwise -Atc 'SHOW server_version;'` | Passed: PostgreSQL 17.11. |
| `npm run build` | Passed with Webpack, including TypeScript and prerendering `/`, `/login` and the not-found route. |
| `npm run check:client-bundle` | Passed on final build: 20 emitted client JavaScript/map files scanned; no Prisma markers, PostgreSQL URLs or configured secret values found. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Passed: 7 tests against a production server; both pages at 320/390/768/1440px, no page-wide overflow, zero axe WCAG A/AA violations, keyboard navigation/focus, reduced motion, 200% CSS layout scaling and 404 recovery. No page errors in responsive tests. |
| `npm run dev -- --port 3000` + HTTP check | Passed: server ready; landing responded HTTP 200. Development server was stopped after verification; PostgreSQL remains running with persistent local demo data volume (no domain records). |
| `npm ls --depth=0` | Passed: installed direct dependencies resolve without invalid peers. |
| Documentation preservation and local Markdown checks | Passed: original AGENTS.md, overview.md, architecture.md, domain-rules.md, ui-ux.md, all 18 numbered specs and feature index match pre-scaffold SHA-256 values. Only tech.md/progress.md changed intentionally. Local Markdown links/code fences pass; manifest and lockfile dependency/runtime declarations match. |

### Visual and interaction inspection

Inspected captured 1440px desktop, 768px tablet, 390px mobile and 320px narrow landing screenshots and mobile pending-login screenshot. Layout is readable with wrapped text and labelled synthetic content; mobile illustration stacks as an agenda. Screenshots are under ignored `test-results/`. Browser tests verified the skip link, primary-action focus and 2px outline, navigation to pending login and return, reduced-motion styling, contrast scans and lack of horizontal overflow on both pages. There are no data mutations, forms, menus or asynchronous product states in this feature; their pending/error/stale states are not fabricated.

### Failures corrected, limits and unfinished work

- First lint run failed on an anonymous PostCSS default export; changed it to a named configuration. First unit run exposed refinement exceptions for malformed URLs and an unnamed figure; validation now returns a safe error and the figure references its caption. All those checks subsequently passed.
- Turbopack builds failed because its CSS worker could not bind a port on the host, including the approved retry. Development/build explicitly use supported Webpack mode; final builds and both dev/production serving passed. Initial database/HTTP attempts were sandbox-blocked; approved local-connection retries succeeded. The clean installation's first Prisma generation could not update the shared engine-cache timestamp inside the sandbox; its approved retry passed typecheck, lint and all nine tests.
- Next development startup appended a managed agent block. Disabled the documented `agentRules` option and restored AGENTS.md byte-for-byte; preservation was checked again after server restart.
- **Unfinished tooling maintenance:** ESLint 9.39.5 is deprecated/unsupported. The Next preset's React/import/accessibility peers do not accept ESLint 10; the attempted standard-preset upgrade produced peer incompatibility warnings. A separate modern plugin configuration was prepared, but approval for its dependency installation was declined. Restored the approved ESLint 9 preset and matching lockfile; no subsequent dependency upgrade was attempted. Lint passes, and a scoped minimatch 11.0.8 override removes the transitive development-tool audit advisory. A supported lint-toolchain migration still needs completion; this caveat must not be omitted from a future handoff.
- Automated axe checks and CSS 200% layout scaling are bounded verification, not a claim of exhaustive accessibility, manual toolbar zoom or screen-reader testing. Browser QA used installed Chrome; downloading Playwright Chromium was not exercised.
- npm install/ci emitted npm 11 lifecycle allow-list notices for Prisma/esbuild/fsevents. Generation/build/tests worked; no broad script approval or project-wide policy override was added.
- No domain schema, seed records, authentication, scheduling writes, role authorization, concurrency workflow or deployment exists. Those are later-feature scope, not missing foundation implementations. `db:seed` is deliberately absent until a feature owns seed data.

**Next step:** address the documented lint maintenance item when authorized. Feature 001 is the next product feature only if separately requested. Stop here for this task.


## Feature 001 handoff — 2026-11-13

**Status: complete for the requested local-demo scope.** All six numbered acceptance criteria were verified. Work stops after this feature. The feature 000 unsupported-ESLint caveat remains unchanged.

### Prerequisites and scope

Read AGENTS.md, overview, progress, tech, architecture, domain rules, UI/UX and specification 001; inspected the actual package scripts, Next pages/primitives, Prisma configuration, initial migration, environment handling and tests. PostgreSQL was healthy and the foundation code was present. The lint support limitation does not prevent implementing or checking authentication, so no unrelated lint migration was attempted.

Implemented identity only: Department/User/Role, with teaching profiles and section memberships deferred to feature 002. There are no teaching/section data endpoints to expose unscoped student/faculty records. The minimal `/admin` access screen provides a real, authorized revocation/reactivation operation for this auth feature; full provisioning, role-editing UI and master-data management remain absent. Only implemented routes appear in navigation.

### What changed and key paths

- `package.json` / `package-lock.json`: stable `next-auth@4.24.15`, `argon2@0.45.2`; explicit seed, isolated-test migration and integration-test scripts. Existing lint dependencies were preserved.
- `prisma/schema.prisma`, `prisma/migrations/20261112010000_auth_roles/migration.sql`: role enum, Department/User, department foreign key, unique canonical email and a database lowercase/trim constraint. Migration is additive and uses no resets.
- `src/server/auth/{config,password,credentials,limiter,options,session,page-session,permissions}.ts`: server-only secret configuration, Argon2id hashing, credential verification, server-side attempt admission, JWT identity sessions, fresh active-user resolution and scoped permission helpers. `src/app/api/auth/[...nextauth]/route.ts` handles the library's auth/CSRF flow.
- `src/server/services/accounts.ts`: departmental admin query and access mutations; stable-order actor/target row locks, current permissions, cross-department/self rejection and expected-status checks. Current authorization is checked inside the write transaction; stale submissions return a refresh message.
- `src/features/auth/schema.ts`, `actions.ts`, `components/{login-form,logout-button,account-access-form}.tsx`: validated credential/access forms with pending, generic failure, success, permission-denial and stale-data feedback. No signup, SSO, recovery service or role-switch bypass.
- `src/app/(auth)/login/page.tsx`, `src/app/(app)/{layout,loading,error}.tsx`, dashboard/admin pages and `src/app/error.tsx`: login, protected role dashboards, account access and safe loading/error boundaries. `src/components/{app-shell,public-shell}.tsx`, root layout, landing and `globals.css`: responsive protected sidebar/dialog menu, account/logout context and updated landing availability. Unimplemented schedule/workload values are not fabricated.
- `prisma/seed.ts`, `.env.example`: explicit development-only seed with a required password environment variable and five synthetic `.test` accounts; preserves existing accounts/passwords. The ignored local `.env` was supplemented with random local auth/seed secrets, the canonical loopback URL and isolated test DB URL. No secret value is included in source or this record.
- `scripts/migrate-test-db.mjs`, `tests/integration/auth.test.ts`, `tests/unit/auth.test.ts`, updated foundation tests, `tests/e2e/auth.spec.ts`, `playwright.config.ts`, enhanced client-bundle scanner: real scoped fixtures and checks. Tests refuse a database path other than `/slotwise_auth_test`; they remove only their own unique fixture departments/users.
- README and tech.md document setup, demo accounts, session/cookie choices, throttling, test isolation, React/Next concepts and limitations. Other shared context files and feature specifications were not edited.

### Acceptance criteria verified

| Criterion | Evidence |
| --- | --- |
| Valid active credentials show the correct role dashboard/navigation and persist | Browser login/reload/logout flow for all five roles; real PostgreSQL credentials and Argon2id. |
| Invalid credentials create no session and show a generic error | Browser checks generic text/no session cookie; integration checks incorrect, unknown and inactive credentials. |
| STUDENT cannot invoke an admin mutation | Real service calls reject STUDENT without modifying the target; browser stale-admin form is submitted after its actor becomes STUDENT and the Server Action denies it. Direct student `/admin` navigation shows access denied. |
| Revocation/role change overrides stale claims | Integration role/revocation checks, concurrent actor revocation under a database lock, browser revoked-session redirect and updated dashboard/navigation after a role change. |
| Repeated failures throttle on the server | Five failed real password attempts then a correct sixth attempt are rejected; unit checks simultaneous admission, exact expiry boundary and account-rotation global limit. |
| Logout requires authentication on subsequent protected requests | All five browser role flows sign out, then request `/dashboard` and return to `/login`. |

### Commands and actual results

All runtime checks used Node **24.22.3** and npm **11.17.0**, selected with `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`. User equivalent: select `.nvmrc` with nvm. Database tests used the explicitly created, isolated `slotwise_auth_test` database; the main `slotwise` database contains only the five seeded auth identities and department.

| Command/check | Actual result |
| --- | --- |
| `npm install next-auth@4.24.15 argon2@0.45.2 --save-exact --no-fund` | Installed 20 packages; audit reported zero vulnerabilities; npm lifecycle allow-list notices remain. Native Argon2 successfully hashed and verified passwords. |
| `npm ls --depth=0` | Passed, no invalid peers. Installed auth package peer metadata accepts Next 16 and React 19. |
| `docker compose ps` | Existing PostgreSQL service healthy, bound only to loopback port 5433. |
| `npm run db:migrate` | Applied additive `20261112010000_auth_roles` to local demo DB. |
| `npm run db:seed` | Created five synthetic accounts using an explicitly supplied local environment password. |
| Seed boundary/idempotency check via Node/tsx and subprocesses | Passed: repeated seed left all five records/hashes unchanged; production and missing-password invocations exited unsuccessfully as intended. No secret values printed. |
| `docker compose exec -T db createdb -U slotwise slotwise_auth_test` + `npm run db:test:migrate` | Dedicated test DB created; both checked-in migrations applied without resets. |
| `npm run db:check` | Passed: real Prisma `SELECT 1`. |
| `npm run db:validate` | Passed. |
| `npm run typecheck` | Passed: Prisma generation, Next route types and TypeScript `--noEmit`, including tests. |
| `npm run lint` | Passed with zero warnings. Inherited ESLint 9.39.5 support caveat remains. |
| `npm test` | Passed: **13 tests in 3 files**. |
| `npm run test:integration` | Passed: **8 tests** against real PostgreSQL; hashing/credentials, throttling, normalized identity, unauthorized/other-department/self rejection, stale role/revocation, concurrent revocation and competing writes. |
| `npm run build` | Passed with Webpack: `/`, `/login`, not-found; dynamic `/dashboard`, `/admin`, auth handler. |
| `npm run check:client-bundle` | Passed: **29 emitted client bundles**, no Prisma/database/hash markers or configured secret values. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Passed: **23 tests**, two browser workers, production server and isolated DB. All five roles, invalid/throttled login, CSRF, tampered cookie, current permissions, pending/stale UI, responsive/keyboard/reduced-motion/accessibility and public-page regression checks. |
| README/context local Markdown link and code-fence check | Passed; no missing local targets or unbalanced fences. |

### Visual and interaction verification

Inspected captured desktop/mobile login, 1440px admin, 320px dashboard and 390px admin screenshots, including wrapped long synthetic names/emails. Automated browser checks cover landing/login/dashboard/admin at **320, 390, 768 and 1440px**, zero page-wide horizontal overflow, axe WCAG A/AA checks, native required-field validation, Enter-key login, visible focus and keyboard menu/Escape/focus restoration. Protected pages and public pages also pass **200% CSS layout scaling**. Screenshots live under ignored `test-results/`.

Initial browser run had 17 passes and three failures: a real topbar reflow issue at 320px/200%, and two sign-in network failures (one aborted credential request and one stalled request). Added topbar wrapping; all three targeted checks passed. Bounded browser workers to two because credential checks use native 64 MiB Argon2 work. The complete expanded suite subsequently passed. The original network failures do not establish a server-side authorization defect; their root cause was not proven.

Other corrected check failures: initial migration diff required a shadow database when diffing migration history, so SQL was generated from the empty domain baseline (foundation had no domain tables); no reset/shadow DB was used. A TypeScript test helper initially inferred a UUID-only password type and now accepts strings. CLI integration imports initially pulled in Next client navigation under the React-server condition; page redirect logic now lives in its own server page-session module. Final checks passed after these corrections.

### Limits and next step

- The process-local limiter is an explicitly allowed demo choice: five attempts per normalized email/15 minutes (successes also count), 100 attempts/process/minute, counters clear at process restart. It is **unsuitable for multi-instance production**; use a shared atomic limiter there.
- Credentials use eight-hour JWT identity sessions, with current active status/role/department reloaded for protected work. Logout clears the current browser cookie; durable per-token/global logout is not provided. Already rendered tabs update authorization on their next protected request.
- Production requires a configured canonical URL and HTTPS, except explicit loopback HTTP for local build QA. HTTPS cookie configuration has unit coverage; a deployed HTTPS environment was not browser-tested. No deployment exists.
- Automated accessibility and CSS zoom are bounded checks, not full screen-reader/manual browser-toolbar zoom verification. Playwright used installed Chrome; downloading its Chromium build was not exercised.
- Existing deprecated ESLint 9 support limitation remains unfinished, although lint passes. No unrelated lint migration or later-feature dependency was introduced.
- No remaining numbered feature-001 acceptance blocker. Scheduling/master-data/teaching profiles, role-editing/provisioning UI and features 002–017 remain out of scope.

**How to demo:** run `npm run dev` with Node 24, open `/login`, use `faculty@demo.slotwise.test` and `student@demo.slotwise.test` with the current local `DEMO_SEED_PASSWORD` from ignored `.env`; compare dashboards and test direct `/admin` denial. In another browser profile, sign in as `admin@demo.slotwise.test`, revoke/reactivate faculty and reload the faculty dashboard. Sign out and revisit `/dashboard`. Full setup and isolated-check commands are in README.

**Concepts demonstrated:** App Router route groups and layouts; server-rendered authorized reads; server-only data boundaries; Client Component state/refs; React 19 `useActionState`; validated Server Actions and revalidation; controlled pending/error/success/stale feedback; reusable typed UI; authentication versus server authorization. The next product feature is **002**, only when requested. Stop here.


## Feature 001 local commit handoff — 2026-11-13

- User confirmed a successful faculty sign-in in Safari; the screenshot shows the expected FACULTY dashboard. Prior local diagnostics also verified the active faculty account, password/hash match and a successful HTTP login/dashboard response without printing secrets.
- Added foundation/auth source, tests, migrations, package lock and project context to version control after the README-only initial commit. Local `.env`, dependencies, generated Prisma files, Next output and browser artifacts are excluded by `.gitignore`.
- This handoff changes version-control documentation only; application code is unchanged from the verified feature 001 implementation. The feature's recorded automated checks remain the latest application results; they were not rerun solely for committing unchanged code.
- Commit requested locally; no push is part of this request. Feature 002 remains unstarted.
