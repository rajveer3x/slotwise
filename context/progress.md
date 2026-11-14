# SlotWise progress

Last updated: 2026-11-14

## Verified current state

Features 000–004 are implemented and verified locally. Feature 004 adds `/leave`: scoped leave requests, read-only impact previews against real dated occurrences, owner withdrawal and transactional separate-HoD approval/rejection. Approval cancels current future teaching, releases reservations, retains obligations/delivery, increments affected revisions and audits once. Timetable publication respects approved absence and protects leave-linked cancellations. Features 005–017 remain unimplemented. The inherited feature 000 ESLint 9 support limitation remains open; lint passes. Git remains on `main` with origin `https://github.com/rajveer3x/slotwise.git`; no deployment exists. Historical handoffs below describe their state at the time; the feature 004 handoff, follow-up verification and live-development recovery records below are current.

## MVP build order

| ID | Feature | Depends on | Status |
| --- | --- | --- | --- |
| 000 | Project foundation | None | Implemented; lint-tooling follow-up unfinished |
| 001 | Authentication and roles | 000 | Complete; local demo verified |
| 002 | Master data and demo fixtures | 001 | Complete; local persistence, scope, browser and seed checks verified |
| 003 | Timetable and clash detection | 002 | Complete; local constraints, transactions, concurrency and browser checks verified |
| 004 | Leave requests and impact preview | 003 | Complete; dated impact, transactions, permissions, concurrency and browser flow verified |
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
- Documentation creation is complete; foundation application code now exists. Authentication, master data, manual timetable publication and leave approval are implemented; recovery recommendations and publication remain pending.
- UI design revision: adapt the supplied Notion marketing reference into SlotWise's warm neutral workspace, readable data layouts and blue action palette. ui-ux.md owns the implementation design; reference-specific instructions and exact marketing measurements are not requirements.
- Animmaster Lib, Skiper UI and Vengeance UI are optional sources. No component package or paid code was installed; project-owned CSS/shadcn primitives remain the baseline. Check the exact component before adoption.

## Open inputs

Deadline, team size, marking rubric, mandated framework versions, hosting target, and institution policy are unknown. These do not block building the local MVP using the explicit defaults. Ask when an input materially affects the selected feature.

## Next action

Stop after feature 004 as requested. Feature 005 (explainable resolution engine) is next only on a separate request. Approved leave now links cancelled dated occurrences to retained unresolved obligations; feature 005 can query these and approved absences without inventing coverage counts. The inherited supported-lint-toolchain migration remains a separate maintenance item.

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


## Feature 002 handoff — 2026-11-13

**Status:** complete; all five numbered acceptance criteria verified locally. Feature 003 was not started. No dependency was added, no commit/push/deployment was performed, and no real university data was used.

### What changed and key paths

- `prisma/schema.prisma` and `prisma/migrations/20261113000000_master_data/migration.sql`: semester/holidays, faculty/availability, courses/qualifications, sections/memberships, rooms, teaching slots, allocations and retry receipts. Department ownership is part of relation keys, with restrictive foreign keys, uniqueness, positive count/limit checks, valid local date/interval checks and one active unarchived semester per department. Department online teaching defaults false; semester schedule revision starts at zero.
- `src/server/services/master-data.ts`: authorized scoped reads and transactional writes; current active ADMIN/COORDINATOR permissions; actor and department locks; per-record versions; safe validation/duplicate/scope feedback; payload/actor-bound receipts checked before stale-version rejection. Competing writes across distinct managers serialize. Qualifications, matching allocation semesters, role-correct accounts, one section per student/semester, semester/holiday boundaries and adjacent/non-overlapping intervals are enforced.
- `src/features/master-data/{config,schema,actions}.ts` and `components/{master-form,feedback}.tsx`: reusable typed field descriptions, per-entity Zod schemas, Server Action adapters, controlled forms, pending controls, retained failed input and explicit stale-page refresh. Refreshing server props after another form saves does not silently replace an unsaved draft or adopt a newer expected version. Saved results appear only after database commit.
- `src/app/(app)/admin/page.tsx`: URL category/search/archive filters and responsive labelled record lists, create/edit forms, dependency-aware archive/restore disclosures, empty/no-match states and timezone/synthetic labels. All eleven entity categories are available. Account access moved to `admin/accounts/page.tsx`; shell navigation, dashboard copy, auth action revalidation and auth browser tests follow that route. Existing workspace loading/error boundaries are reused; error copy now covers workspace data.
- `prisma/demo-fixtures.ts` and `prisma/seed.ts`: transactional deterministic create-only upserts. Computing has two sections, six faculty, four courses, three rooms including a lab, a semester/holiday, student memberships, explicit qualifications, availability, weekly slots and eight allocations. Design has a smaller independent fixture. Existing users, passwords, access and teaching edits are preserved. Production seeding is refused; there is no reset. All identities, capacities, teaching targets/limits and dates are project-authored demo examples.
- Added `tests/unit/master-data.test.ts`, `tests/integration/master-data.test.ts` and `tests/e2e/master-data.spec.ts`. Updated README, tech.md and architecture.md for actual routes, storage, demo and server/client boundaries; corrected stale design/spec-index status text to point to verified progress. Next's generated `next-env.d.ts` now references production route types after the build.

### Acceptance criteria

| Criterion | Actual verification |
| --- | --- |
| 1. Scoped valid changes persist after reload | Browser created all eleven entity types, including a room and qualified allocation; reload and real PostgreSQL assertions passed. Integration checks edit/archive/restore every entity, including reassignment to another qualified faculty member. |
| 2. Invalid intervals/capacity/duplicate codes/unrelated FKs rejected with field feedback | Unit boundaries, real-service validation and composite-FK SQL checks passed; duplicate-code browser submission shows field feedback and retains input. Semester/holiday, one-active-semester, membership and qualification rules were exercised. |
| 3. Foreign department reads/mutations denied | Direct service checks reject foreign record IDs and unrelated parent IDs. All returned snapshot records stay in scope; foreign room content stays absent in the browser. Anonymous, HoD, faculty, student, revoked-account and changed-role attempts are rejected server-side. |
| 4. Referenced records survive removal | Every entity supports reversible archive/restore. Referenced faculty retains allocations and its user. New relationships reject archived parents. UI explains preserved references, reserved codes and restoration. Rooms cannot yet have timetable references because timetable/publication is a later feature. |
| 5. Seed reruns do not duplicate records | Seed ran twice against the local demo database. Integration checks rerun a unique namespace, compare every entity/user count, preserve an edited capacity and existing password hash, and verify production refusal. |

### Commands and actual results

Commands used Node **24.22.3** via `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`; npm **11.17.0**, local PostgreSQL **17.11** and installed Chrome. Integration/browser fixtures used only `slotwise_auth_test` and cleaned their own unique departments; no database was reset.

| Command/check | Result |
| --- | --- |
| `npm run db:migrate` | Passed; migration 20261113000000 applied to the persistent local demo database. |
| `npm run db:test:migrate` | Passed; the same migration applied to isolated slotwise_auth_test. |
| `npm run db:seed` (twice) | Passed both times; deterministic synthetic Computing/Design fixtures, no reset or duplicate failure. |
| `npm run db:validate` / `npm run db:check` | Passed; schema valid and real Prisma SELECT 1 succeeded. |
| `npm run typecheck` | Passed; Prisma generation, Next route generation and strict TypeScript. |
| `npm run lint` | Passed, zero warnings. Existing ESLint 9 support limitation remains. |
| `npm test` | Passed: 17 tests across four files, including four master-data boundary tests. |
| `npm run test:integration` | Passed: 20 tests, including 12 master-data tests exercising PostgreSQL scopes, all-entity edits/archive/restore, real constraints, seed preservation, retries, distinct-manager competing writes and actor revocation while a mutation waits. |
| `npm run build` | Passed; production Webpack build includes /admin and /admin/accounts. |
| `npm run check:client-bundle` | Passed; 30 emitted client bundles contained no Prisma markers, database URLs or configured secrets. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Passed: all 30 browser tests, including seven new master-data flows, against the production build. |
| `git diff --check` | Passed. |

Browser verification includes keyboard-only room creation, a held Server Action with disabled pending controls and one submission, direct role revocation with an already rendered form, reload persistence, search/no-match, duplicate field errors, draft preservation across another form's save, stale-version rejection, explicit refresh and archive/restore. Rendered faculty/room/allocation screens were checked at 320/390/768/1440px, reduced motion and 200% CSS layout scaling; no page-wide overflow or browser errors and zero axe WCAG A/AA findings in those checks. Representative desktop/mobile room and long-name faculty screenshots under ignored `test-results/` were opened and visually inspected. An initial screenshot revealed tests were capturing the loading boundary; the checks now explicitly await rendered content and were rerun. The first browser attempt also caught an ambiguous test locator, and the allocation reassignment check required the archival test to select a currently referenced faculty; those test fixtures/locators were corrected and final checks pass. No comprehensive screen-reader claim is made.

### Limits, demo and next step

- All removal is reversible archival, including unreferenced rows. Archived codes and identity relationships remain reserved; restore/edit those records. Fields marked fixed identify the record (for example section → semester). Allocation faculty is editable, with current qualification checks. Archiving preserves dependencies; it does not delete accounts or invalidate historical foreign keys. Restoring a semester does not automatically activate it.
- No timetable/publication exists yet, so no published-schedule validation is claimed. The future scheduling/publication feature must recheck archived resources and guard every master-data edit affecting published occurrences using the shared scheduling protocol. No reservations, generated classes, delivery, CSV, messaging, account provisioning or role-editing UI were added.
- Dates are local canonical calendar strings; times are weekday/minute configuration. Search uses department-scoped demo-sized snapshots; pagination/large-scale data optimization and automatic live updates are not implemented. Existing auth limiter/session and lint-tooling limitations remain as recorded in feature 001/000.
- Demo: `npm run dev`, sign in as `coordinator@demo.slotwise.test` using the local seed password, open Master data → Rooms, create/edit/reload/archive/restore a room and reject a duplicate code. For a new allocation, create a course and explicit faculty qualification, then select a matching semester/section and enter weekly periods plus semester minutes. Seeded course/section allocation pairs already exist and are unique. ADMIN account access is at `/admin/accounts`.
- **React/Next.js concepts:** server-rendered authorized reads, Client Components and controlled form state, reusable typed components/configuration, React 19 `useActionState`, validated Server Actions, URL filters, loading/error boundaries and `revalidatePath`; database transactions, server authorization, optimistic versions and idempotent receipts provide the persistence boundary.

**Next recommended product feature:** 003 timetable and clash detection, only when separately requested. Stop here.

## Feature 002 verification follow-up — 2026-11-13

**Status:** verified locally after reviewing the implementation against its specification and rerunning checks. Two input edge defects were reproduced with failing regression checks and fixed; no remaining blocker was found in the tested feature-002 scope. Later timetable/publication work and existing tooling/deployment limitations remain as documented above.

- `src/app/(app)/admin/page.tsx`: repeated URL search parameters previously arrived as arrays and made `q.trim()` throw. Normalize category, search and archive parameters to their first value. A production-browser regression now verifies repeated parameters load the correct category/search/archive state.
- `src/features/master-data/schema.ts` and `actions.ts`: JavaScript coercion previously treated null/blank/boolean start minutes as a valid midnight. Require an explicit numeric/string minute value, and accept browser clock values only in valid HH:MM form. Missing/invalid clock values receive server-side field feedback; explicit midnight remains valid. Unit and real-database regressions prove rejection without a write; a browser test bypasses native required-field validation and verifies server rejection plus retained input.
- Regression files: `tests/unit/master-data.test.ts`, `tests/integration/master-data.test.ts`, `tests/e2e/master-data.spec.ts`. No dependency, schema/migration, account or production configuration change was needed. Existing working-tree changes were preserved.
- Fresh checks with Node 24.22.3: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:validate`, `npm run db:check`, `npm run db:test:migrate` (no pending migrations), `npm run check:client-bundle` (30 bundles) and `git diff --check` all passed. `npm test`: **18/18**; `npm run test:integration`: **21/21**; `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: **32/32** against the fresh production build.
- Read-only checks of the persistent local demo database confirmed Computing has six faculty, two sections, four courses, three rooms, two memberships, one semester and eight allocations; Design has one of each. Tests reran seed idempotency/preservation in the isolated test database; the main demo data was not reset or modified by this follow-up.
- Browser coverage again passed login/logout, every master-data create flow, persistent reloads, role/department denial, duplicate/invalid input, archive/restore, stale edits, pending/double-submission handling, keyboard use and responsive/axe checks at 320/390/768/1440px with reduced motion and 200% CSS scaling. Fresh desktop room and mobile long-name faculty screenshots were opened and visually inspected; no layout defect was observed. Full screen-reader/deployed-environment verification is not claimed.
- Demo remains `npm run dev` → sign in as the seeded coordinator → Master data. This verification reinforces the existing React/Next.js concepts: controlled form state, Server Actions with server-side validation, Server Components and URL-filter handling. Next product feature remains 003, only on a separate request.


## Feature 002 GitHub handoff — 2026-11-13

- User requested committing and pushing the verified master-data implementation and its verification fixes to the configured repository, `https://github.com/rajveer3x/slotwise.git`, on the existing `main` branch.
- Fetched origin before preparing the commit; local and remote main matched. The commit includes feature 002 code, migration, synthetic fixture generator, regression tests and context updates. No force push, deployment or later feature is part of this handoff.
- Local `.env`, generated Prisma output, Next build output, dependencies and test screenshots/traces remain excluded. Next's already tracked declaration file reflects the successful production build. Staged whitespace and configured-secret checks passed before commit.
- Application code is unchanged since the verification follow-up: 18 unit, 21 integration and 32 browser tests passed, together with typecheck, lint, build and database/client-bundle checks. Only this version-control handoff note was added; those application checks were not rerun solely for the documentation change. The push result is verified against the remote branch and reported in chat.


## Feature 003 handoff — 2026-11-14

**Status:** complete; all six numbered acceptance criteria verified locally. Manual scheduling only; no auto-generation, solver, AI, external messaging, leave workflow or delivery-credit feature was added. No dependency install, commit, push or deployment was performed.

### Changes and key paths

- `prisma/schema.prisma`, `prisma/migrations/20261113010000_timetable/migration.sql`: timetable versions/entries, stable weekly obligations, dated occurrences, active faculty/section/room reservations, scheduling receipts, append-only application audit records and minimal recipient notifications. Composite department foreign keys and restrictive relationships retain history. PostgreSQL `btree_gist` exclusion uses half-open timestamptz ranges; a partial unique index prohibits two active occurrences for one obligation. The migration is applied to both local databases without resetting data.
- `src/domain/scheduling/timetable.ts`: pure interval, consecutive-slot/lab, capacity, qualification, availability, daily/weekly cap, allocation completeness, holiday materialization and deterministic alternative-placement functions. Availability can cover adjoining intervals. At most three valid alternatives preserve the candidate's allocation/duration and move no peers.
- `src/server/services/timetable.ts` and `scheduling-store.ts`: authorized department reads and student section scoping; durable draft versions; explicit preview fingerprints; actor-bound, payload-bound idempotent receipts; commit-time validation, department locking, retained-week/cross-semester conflict checks, dated reservation replacement, revision increment, audit and notifications in one transaction. A retry of a successful request returns its original result before stale rejection.
- Weekly series IDs and local Monday week keys preserve obligation identity across weekday moves. Future pending occurrences are cancelled/replaced with links; historical/delivered records remain unchanged, including the effective-date boundary week. Future `resolved` records block generic template replacement. Existing materialized units retain their allocation and duration.
- `src/server/services/master-data.ts` and its action now guard published classes and advance schedule revisions after harmless changes. Invalid room, faculty, availability, qualification, slot, calendar, allocation or other resource edits roll back. User-row locks in master-data/accounts/scheduling use `FOR NO KEY UPDATE`, preserving revocation serialization without blocking notification foreign-key references while another manager waits for the department lock.
- `src/app/(app)/timetable/page.tsx`, `src/features/timetable/{schema,actions,components}.tsx/ts`, shell/dashboard and `globals.css`: scoped Server Component reads and URL filters; controlled create/place/move forms; native drag/drop; rejected-move explanations and alternatives; retained failed input; pending/double-submit protection; deliberate stale refresh; before/after preview and confirmed publication. Desktop tables scroll within a labelled region; mobile agendas, long labels, focus states and reduced motion remain usable. Notification/audit viewers remain features 010/011.
- Added `tests/unit/timetable.test.ts`, `tests/integration/timetable.test.ts`, `tests/e2e/timetable.spec.ts` and reusable synthetic `tests/support/timetable-fixture.ts`. Fixtures use isolated 2099 semesters and unique departments. Existing seed data was not reset or populated with a generated schedule.

### Acceptance evidence

| Criterion | Actual result |
| --- | --- |
| 1. Teacher/section/room conflict explanations and publication rejection | Pure and real-service checks identify each resource and interval. Browser rejects an overlapping placement, retains input and repairs it using an offered alternative. A stored invalid draft still fails publication; no occurrence is committed. |
| 2. Adjacent intervals do not conflict | Unit boundaries, publication of adjacent classes and real PostgreSQL reservations pass. A direct overlapping reservation insert fails the exclusion constraint and rolls back. |
| 3. Lab suitability and consecutive slots | Unit and PostgreSQL service checks reject a theory room, a one-slot lab and a span crossing a break. A two-slot laboratory class publishes and reserves its full 120 minutes. |
| 4. Publication retry and holidays | Concurrent same-request retries return the same result with six obligations/occurrences and eighteen reservations, one audit event and one notification per eligible recipient. Holiday dates are omitted. Different actor/payload reuse is rejected. |
| 5. Competing publications | Two managers publishing the same semester yield one commit and one stale result. Overlapping semesters yield one commit and one dated-resource conflict. A simultaneous room-capacity downgrade either wins and stales publication, or rolls back after publication. Injected late notification failure rolls back occurrences, obligations, reservations, audit and revision together. |
| 6. History and obligation identity | A subsequent weekday revision preserves the delivered occurrence byte-for-byte and the existing obligation records; replacements link to cancelled originals. A midweek effective date cannot duplicate an earlier weekly unit. Future resolved records block publication. |

Direct authorization checks cover anonymous, faculty, student, HoD, revoked managers, foreign semesters/rooms/drafts, and actor revocation while publication waits. Student snapshots expose no draft/master data and only their member section's occurrences. A different-section student sees no classes. Existing authentication and master-data regressions also pass.

### Commands and results

Node **24.22.3**, npm **11.17.0**, PostgreSQL **17.11**, installed Chrome; commands select `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`. Integration/browser tests use only `slotwise_auth_test`, remove their own uniquely scoped records and never reset a database.

| Command | Result |
| --- | --- |
| `npm run db:migrate` | Passed; feature 003 migration applied to persistent local demo DB. |
| `npm run db:test:migrate` | Passed; migration applied to isolated test DB. |
| `npm run db:validate` / `npm run db:check` | Passed; schema valid and Prisma SELECT 1 succeeds. |
| `npm run typecheck` | Passed; generated Prisma/Next types and strict TypeScript. |
| `npm run lint` | Passed, zero warnings. Existing ESLint 9 support limitation remains. |
| `npm test` | **24/24 passed**, five files. |
| `npm run test:integration` | **34/34 passed**, including thirteen new scheduling cases. |
| `npm run build` | Passed; dynamic `/timetable` included in production build. |
| `npm run check:client-bundle` | Passed; **31** bundles, no Prisma markers, database URLs or configured secrets. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | **39/39 passed**, including seven timetable cases, with the production server and isolated database. |
| `git diff --check` | Passed. |

The seven timetable browser cases were also rerun successfully after expanding the visual fixtures to a full four-class teaching day and adding published-mobile-agenda accessibility coverage. Typecheck and lint passed again after those test-only additions.

Browser coverage includes keyboard-only move, pending controls with one request, stale input and refresh, rendered-form role revocation, drag persistence, conflicting drop rejection, alternatives, invalid publication, preview, publication and scoped student reads. Layout checks cover **320/390/768/1440px**, 200% CSS layout scaling, long course names, full-day fixtures, mobile agendas and reduced motion. Axe WCAG A/AA checks have no findings in tested draft/preview/published-agenda states. Representative desktop/mobile screenshots under ignored `test-results/` were opened and inspected. Automated scans/CSS scaling do not establish full screen-reader or browser-toolbar zoom testing.

Initial failures exposed a real actor-lock/notification FK deadlock, selection focus interrupting drag, a non-focusable scrolling preview, nested-select label matching and narrow-screen intrinsic sizing. Those were corrected and rerun. Test-only corrections included a Prisma nested fixture write, a shadowed helper variable, waiting for enabled drag controls and avoiding nested-button drop coordinates. One diagnostic overflow assertion mistakenly included intentionally clipped timetable contents; the final assertion checks page-wide overflow while permitting the labelled grid's internal scrolling.

### Limits, demo and next step

- Demo policy is explicitly Asia/Kolkata, in-person Monday–Friday, at least two consecutive slots for labs, and complete weekly counts for every unarchived semester allocation. Unsupported timezones fail explicitly. The editor is synchronous and intended for demo-sized departments (up to 300 entries per submitted draft); no solver or broad institutional-scale performance claim is made.
- The existing semester ends 18 December 2026. Choose a future effective date within it; later use requires configuring a new semester/allocations. The seed preserves existing configuration. No draft or published schedule is inserted into the persistent demo database automatically.
- Preview is provisional and reserves nothing. Saving after master-data changes revalidates a draft; publication recomputes the dated plan and requires its reviewed fingerprint. Revision changes require refresh/review. Full leave absence/cover approval checks, delivery confirmation, ledger, notification UI and audit viewer belong to later features and remain unimplemented.
- Minimal notifications are committed in-app records only, not push/email. Audit append-only behaviour is enforced by the available application services, not cryptographic immutability. Some installed Prisma/pg reads emit a driver concurrency deprecation warning; checks pass on pg 8, with a future driver-upgrade compatibility follow-up. Inherited auth limiter/session and ESLint limitations remain.
- Demo: sign in as `coordinator@demo.slotwise.test`, open **Timetable**, create a future-effective draft, place allocations until incomplete counts clear, attempt a resource conflict, select an alternative, preview each dated change and publish. Open the student timetable to see the scoped result. Use **Move class** or desktop drag, then clone another draft to demonstrate a prospective revision.
- **React/Next.js concepts:** App Router Server Components and URL filters; Client Component controlled state, refs and `useTransition`; accessible form and native drag events sharing one mutation path; validated Server Actions and `revalidatePath`; server authorization, optimistic draft versions, schedule revisions, preview fingerprints, transactions and idempotent receipts.

Shared context updated: README, architecture (implemented boundaries/protocol), domain rules (explicit demo lab/count/identity policy), tech (actual implementation/dependencies), UI status and this progress file. **Next product feature: 004**, only when requested. Stop here.


## Feature 003 GitHub handoff — 2026-11-14

- User requested committing and pushing the completed manual timetable feature to the configured repository, `https://github.com/rajveer3x/slotwise.git`, on the existing `main` branch.
- Fetched origin before preparing the commit; local and remote main matched. The handoff includes feature 003 source, its reservation migration, scheduling tests and updated project context. The runtime-generated `next-env.d.ts` development-path changes were normalized to the already tracked production paths.
- Application source is unchanged since the recorded verification: 24 unit, 34 PostgreSQL integration and 39 browser tests passed; all seven timetable browser cases passed again with expanded full-day and published-mobile-agenda coverage. Typecheck, lint, build, schema/connectivity and client-bundle checks passed. Those application checks were not rerun solely for this Git handoff.
- Local environment files, credentials, dependencies, generated Prisma output, Next output, browser screenshots/traces and database contents remain excluded. Staged whitespace and configured-secret checks run before commit. This record accompanies the requested GitHub handoff; final push verification is reported in chat.


## Feature 004 handoff — 2026-11-14

**Status:** complete. All six feature acceptance criteria verified locally. Features 005–017 were not started.

### Changes and key paths

- `prisma/schema.prisma`, `prisma/migrations/20261114000000_leave/migration.sql`: LeaveRequest/LeaveStatus, faculty/semester/reviewer department-scoped relationships, private and rejection reasons, version/decision timestamps, linked cancelled occurrences, canonical date/decision checks and PostgreSQL inclusive-date overlap exclusion for SUBMITTED/APPROVED leave. Applied to both local databases without resetting or replacing existing records.
- `src/domain/leave/rules.ts`, `src/features/leave/schema.ts`: institution-local full-day date/semester validation and strict operation payloads. No browser-supplied owner/actor fields are accepted. Optional private reasons and required rejection reasons are capped at 2,000 characters.
- `src/server/services/leave.ts`: scoped list/detail queries and repeatable-read preview queries; owner-only submission/withdrawal; separate departmental HoD decisions; safe coordinator/admin DTOs and student denial. Actor/owner user locks in stable order, department serialization, permission/eligibility reload, expected status/version checks and actor/payload-bound retry receipts guard all mutations.
- Approval re-queries current ACTIVE, future, PENDING-delivery occurrences across the inclusive local range and any overlapping semesters. Occurrences become CANCELLED and link to the approved leave; reservations are removed; obligations and delivery statuses remain unchanged. Every affected semester plus the request semester advances revision, even for zero affected classes. Status, cancellations, revision, one safe transition audit and receipt commit atomically. Audits never contain private or rejection reasons.
- `src/server/services/{timetable,scheduling-store}.ts`: publication rejects approved absences, prospective template replacement fails closed over leave-linked cancellations, and master-data writes preserve future pending/approved leave semester bounds. Already-started and delivered teaching remain outside leave cancellation. `src/features/{master-data,timetable}/actions.ts` also refresh leave reads after relevant commits.
- `src/app/(app)/leave/page.tsx`, `src/features/leave/{actions,components}.tsx/ts`, shell/dashboard: Server Component reads, URL-selected details, controlled dates/reasons, actual class/minute preview, explicit stale-revision/status refresh, retained failed input, pending/double-submit controls, success/error/empty feedback, private details and keyboard-operable decisions. Forms/preview sit beside each other on wide screens and stack on phones. UI explains zero impact, absence of a separate HoD approver, unresolved recovery and the lack of approved-leave reversal.
- Tests: `tests/unit/leave.test.ts`, `tests/integration/leave.test.ts`, `tests/e2e/leave.spec.ts`, `tests/support/leave-fixture.ts`; existing timetable fixture cleanup now removes leave records after occurrences. All records are project-authored synthetic fixtures in the isolated test database. No requests or published classes were added to the persistent demo seed.

### Acceptance and actual verification

Used Node **24.22.3** through `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`; no dependencies added.

| Command/check | Actual final result |
| --- | --- |
| `npm run db:validate` | Passed; Prisma schema valid. |
| `npm run db:test:migrate` | Passed; new migration applied to `slotwise_auth_test`. |
| `npm run db:migrate` | Passed; new migration applied to the persistent local `slotwise` database. |
| `npm run db:check` | Passed; real PostgreSQL `SELECT 1` through Prisma. |
| `npm run typecheck` | Passed; Prisma generation, Next route type generation and TypeScript. |
| `npm run lint` | Passed with zero warnings. |
| `npm test` | Passed; **28 tests across 6 files**, including local-midnight/date/overlap/input boundaries. |
| `npm run test:integration` | Passed; **49 tests**, including **15 leave tests**. Real preview immutability; exactly two classes/120 minutes; inclusive early/late dates; zero impact; invalid/past/overlapping requests; independent database overlap protection; schedule changes before approval; authorization/self-approval/department/privacy; final statuses; concurrent decisions and retries; late failure rollback; publication races/absence guards; actor revocation/owner eligibility; preserved delivered/started teaching; cross-semester cancellation and revisions. |
| `npm run build` | Passed with Webpack; protected dynamic `/leave` route included. |
| `npm run check:client-bundle` | Passed; **32** emitted bundles checked for Prisma, database URLs and configured secret values. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Final full suite passed; **47 tests**, including **8 leave tests** and all existing auth/master-data/timetable/foundation regressions. Separate-user preview/submission/approval/student cancellation; rejection and withdrawal; coordinator response privacy; pending request count; network failure; stale decision and stale preview refresh; keyboard, axe, responsive and reduced-motion checks. |
| `git diff --check` | Passed. |

The first full browser run had one test locator ambiguity because validation appeared in both the associated field error and live status; the locator was scoped to the form status and passed. Visual inspection also caught review screenshots taken during the inherited loading state: the tests now wait for the request heading before axe/screenshots. The corrected four layout tests passed, then the final full **47/47** run passed. No product failure was hidden by those test corrections.

### Visual/demo checks

- Captured preview/review screenshots at **320, 390, 768 and 1440px** in ignored `test-results/`; inspected representative loaded desktop/mobile screenshots. Long faculty/course labels and six-class impact lists wrap, forms stack on mobile, and no page-wide overflow was found. Axe WCAG A/AA scans passed on loaded faculty preview and HoD review screens; 200% CSS layout scaling, reduced motion, keyboard preview/submission/approval and visible accessible controls passed. These checks do not claim exhaustive screen-reader testing.
- The browser demo used separate authenticated faculty, HoD and student users: exactly two actual classes/120 minutes previewed, submission preserved 18 reservations, approval left 12 reservations and all six obligations, and the student saw cancellation with pending delivery and no private reason.
- To repeat using seeded demo accounts: first publish a future timetable as coordinator, then preview/submit `/leave` as `faculty@demo.slotwise.test`, approve the request as `hod@demo.slotwise.test`, and enable cancelled classes for that week as `student@demo.slotwise.test`. The seed itself deliberately publishes nothing. The demo semester ends 2026-12-18; later demos need a newly configured semester/allocation set.

### Limitations, concepts and next step

- No feature 004 acceptance criteria remain blocked or unverified locally. Full-day leave and Asia/Kolkata remain the agreed demo defaults; past leave and approved-leave reversal are unsupported and explained. Template revisions touching leave-linked cancellations fail closed for later recovery review. Recommendations/coverage counts, replacement publication, delivery accounting and notifications UI remain later features; approval does not claim recovery or delivery.
- Existing ESLint 9 support/deprecation limitation and pg concurrency deprecation warning remain inherited; checks pass. No hosting/deployment or live university records were introduced.
- React/Next.js concepts demonstrated: App Router protected Server Components, minimal serializable scoped view models, controlled Client Components, `useState`/`useRef`/`useTransition`, Server Actions, URL-selected details, route revalidation, loading/error boundaries and server authorization independent of navigation. Database status versions, schedule revisions and idempotency keys address different concurrency concerns.
- Shared context updated: `architecture.md` (leave boundary and guards), `tech.md` (migration/defaults and no new dependencies), `README.md` (demo/checks/concepts), and this progress record. Shared policies/specification were not rewritten.
- Next recommended feature: **005 explainable resolution engine**, only when requested.


## Follow-up verification — 2026-11-14

**Status:** all implemented features 000–004 pass the final local checks below. Two previously uncovered feature 004 edge cases were reproduced with failing regression tests, fixed, and reverified. No later feature was implemented.

### Findings and fixes

- A prospective timetable starting Tuesday could move a Monday class that leave approval had cancelled earlier in the same week. The original guard compared occurrence dates only with the effective date, allowing the stable obligation to be recreated outside the leave date through generic template publication. `src/server/services/timetable.ts` now checks the stable obligation IDs of proposed classes against all leave-linked cancellations. Both preview and publication reject this path, retaining the cancellation, reservations, obligation and revision unchanged. `tests/integration/leave.test.ts` adds this boundary regression; it failed before the fix and passes afterward.
- Recomputing an impact preview after an external schedule change could return a newer revision than the still-rendered page. The UI compared revisions for inequality and falsely labelled the newly recomputed preview stale. `src/features/leave/components.tsx` now marks only older previews stale. `tests/e2e/leave.spec.ts` reproduces direct recomputation without an intervening page refresh; it failed before the fix and passes afterward. Existing tests still prove that genuinely older previews are marked stale after refreshing the page.
- `context/architecture.md` records obligation-based boundary protection and monotonic preview freshness. All earlier user changes were preserved. No schema or dependency change was needed for these fixes.

### Commands and actual final results

Used Node 24.22.3 with `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`.

| Command | Actual result |
| --- | --- |
| `npm run db:validate` | Passed; valid Prisma schema. |
| `npm run db:check` | Passed; PostgreSQL connectivity through Prisma. |
| `npx prisma migrate status` | Passed; persistent local database has all five migrations and is up to date. |
| `npm run db:test:migrate` | Passed; isolated test database has no pending migrations. No reset was run. |
| `npm run typecheck` | Passed after both fixes. |
| `npm run lint` | Passed after both fixes, zero warnings. |
| `npm test` | Passed after both fixes: **28 tests / 6 files**. |
| `npm run test:integration` | Passed after the scheduling fix: **50/50**, including authorization, actual constraints, rollback, concurrency and the new midweek regression. |
| `npm run build` | Passed after both fixes; production Webpack build includes all implemented routes. |
| `npm run check:client-bundle` | Passed after both fixes; **32** client bundles checked for Prisma, database URLs and configured secrets. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Passed after both fixes: **48/48**, across authentication, foundation, master data, timetable and leave. Includes nine leave tests, separate-user approval, privacy, network errors, pending/stale feedback, keyboard, reduced motion, axe, 320/390/768/1440px layouts and 200% layout scaling. |
| `git diff --check` | Passed. |

All six feature 004 acceptance criteria remain verified. No new failing checks remain. The inherited unsupported ESLint 9 toolchain and pg concurrency deprecation warning remain documented maintenance limitations; neither caused these checks to fail. The rollback test intentionally injects a late database failure and logs a safe failure before proving complete rollback; that is an expected passing test. No deployment or exhaustive assistive-technology testing is claimed.

Demo remains: publish future classes as coordinator, preview and submit leave as faculty, approve as a different HoD, inspect cancelled/pending-delivery classes as the student. The additional fixes demonstrate stable domain identity across scheduling boundaries and the distinction between React page props and a fresh Server Action result. Stop here; feature 005 remains next only on request.


## Live development recovery — 2026-11-14

**Status:** fixed and verified on the actual development app at `http://127.0.0.1:3000/leave`.

- User screenshots exposed a gap in the previous handoff: an already-running development process retained the pre-leave Prisma client in `globalThis`. The new service attempted `leaveRequest.findMany` on a missing model delegate. Fresh production-test processes passed, and the earlier anonymous HTTP check only verified the login redirect; neither established that the existing signed-in development page worked.
- Reproduced by signing in with the existing synthetic faculty account on port 3000; the page displayed **Workspace unavailable**. No credentials were printed or changed. Restarted the verified SlotWise development process on the same port using Node 24, preserving the database and session secret.
- `src/server/db.ts` now tags its cached client with the generated Prisma constructor reference. Development HMR replaces legacy untagged or regenerated clients and closes the retired pool; ordinary hot reloads reuse the current pool, and production cache reuse remains unchanged. The initial attempted `instanceof` guard was discarded after a real-client check showed that Prisma returns a proxy; the final implementation compares the recorded constructor reference instead.
- Added `tests/unit/db.test.ts` (four cases: current reuse, legacy cache, regenerated constructor, production reuse) and `tests/integration/db-cache.test.ts` (real Prisma proxy reuse/replacement against the isolated test database). README and tech.md explain regeneration, migrations, cache recovery and restarting a stale development process. No dependency, schema, policy or credential change was made.
- Actual live verification used a separate Chrome session and the existing demo faculty login: authenticated `/leave` rendered its request form and preview controls with no workspace/runtime error. Ran `npm run db:generate` while the server stayed running and verified authenticated `/leave` again without another restart. After the final build/type generation, verified **Preview impact** completed and a full page reload still rendered the leave workspace. This check was read-only and submitted no leave request. The development server is left running for the user's Safari refresh.

Final checks with Node 24.22.3:

| Command | Actual result |
| --- | --- |
| `npm test` | **32/32** across 7 files. |
| `npm run test:integration` | **51/51**, including the real-client development cache regression. |
| `npm run typecheck` | Passed with the final cache implementation and integration-test typing. |
| `npm run lint` | Passed. |
| `npm run build` | Passed after correcting test-only environment typing; Webpack production build complete. |
| `npm run check:client-bundle` | Passed; 32 bundles checked. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | **48/48** passed after the cache fix. |
| Live port-3000 browser check | Signed-in page, read-only impact preview and reload passed, with no workspace/runtime error; also passed after client regeneration without restarting. |
| `git diff --check` | Passed. |

No new unfinished product criteria remain from this incident. Inherited ESLint support and pg deprecation maintenance notes still apply. Relevant Next.js concept: hot reload preserves process globals, so a regenerated database client needs explicit cache invalidation; fresh-process test success must be supplemented by checking the actual long-running development app. Feature 005 remains outside this request.
