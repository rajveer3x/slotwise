# SlotWise progress

Last updated: 2026-11-14

## Verified current state

Features 000–009 are implemented locally. Feature 005 adds a deterministic pure TypeScript five-tier engine, `/resolutions` with explanations and batch-aware selections, authorized durable drafts, and provisional faculty coverage estimates. A subsequent presentation refresh adapts the user's dashboard screenshot with Lovely Professional University branding, a charcoal sidebar, rounded gray/white workspace, and lime/lavender accents; see the UI refresh handoff below for checks. Approved leave retains unresolved obligations; draft resolution never reserves, publishes or credits delivery. Feature 006 adds authorized exact-cover responses, server expiry, Saturday HoD decisions, retained consent history and persisted in-app updates at `/cover-requests`. Responses and approvals reserve nothing. Feature 007 adds read-only Before/After subset review and atomic recovery publication with exact consent, replacement history, reservations, safe publication details, audit, notifications and retry receipts. Unselected items become superseded and need recomputation; delivery credit remains unchanged. Feature 008 adds assigned delivery confirmation, reasoned coordinator correction/history, unique obligation credit, separate not-held recovery sources and the semester contact-minutes ledger. All six acceptance criteria are verified locally; see its handoff below. Feature 009 adds department-scoped workload and leave recovery dashboards with real PostgreSQL-backed metrics, CSS bar charts and semantic tables. Features 010–017 remain unimplemented. The inherited feature 000 ESLint 9 support limitation remains open; lint passes. Git remains on `main` with origin `https://github.com/rajveer3x/slotwise.git`; no deployment exists. Historical handoffs below describe their state at the time.

## MVP build order

| ID | Feature | Depends on | Status |
| --- | --- | --- | --- |
| 000 | Project foundation | None | Implemented; lint-tooling follow-up unfinished |
| 001 | Authentication and roles | 000 | Complete; local demo verified |
| 002 | Master data and demo fixtures | 001 | Complete; local persistence, scope, browser and seed checks verified |
| 003 | Timetable and clash detection | 002 | Complete; local constraints, transactions, concurrency and browser checks verified |
| 004 | Leave requests and impact preview | 003 | Complete; dated impact, transactions, permissions, concurrency and browser flow verified |
| 005 | Explainable resolution engine | 004 | Complete; pure rules, durable drafts, scope, concurrency and browser checks verified |
| 006 | Substitute response and Saturday approval | 005 | Complete; authorized responses, expiry, exact consent, concurrency and browser checks verified |
| 007 | Change preview and publication | 006 | Complete; subset review, exact consent, real database races/rollback and browser flow verified |
| 008 | Delivery and contact-minutes ledger | 007 | Complete; unique credit, corrections, recovery, concurrency and browser checks verified |
| 009 | Workload and impact dashboards | 008 | Complete; local metric, scope and responsive browser checks verified |
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
- Documentation creation is complete; foundation application code now exists. Authentication, master data, manual timetable publication and leave approval are implemented; recovery recommendations, draft plans, cover responses and Saturday approvals are implemented; recovery preview and transactional publication are implemented.
- Current UI design: the user's latest dashboard screenshot and implemented charcoal/lime/lavender LPU workspace supersede the initial blue/flat Notion direction. ui-ux.md owns the design and future UI file-creation rules; reference-specific instructions are data, not project requirements.
- Animmaster Lib, Skiper UI and Vengeance UI are optional sources. No component package or paid code was installed; project-owned CSS/shadcn primitives remain the baseline. Check the exact component before adoption.

## Open inputs

Deadline, team size, marking rubric, mandated framework versions, hosting target, and institution policy are unknown. These do not block building the local MVP using the explicit defaults. Ask when an input materially affects the selected feature.

## Next action

Stop after feature 009. Feature 010 (notifications and acknowledgement) is next on a separate request. The inherited supported-lint-toolchain migration remains a separate maintenance item.

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


## Feature 005 handoff — 2026-11-14

**Status:** complete for the requested local-demo scope; all six acceptance criteria verified. Feature 006 was not started. No resolution was published, no dependency installed, no commit/push/deployment performed, and no persistent teaching or seed fixtures were created.

### Changes and boundaries

- Read AGENTS, overview/progress, domain rules, architecture, tech, UI/UX, common contract and spec 005; verified actual 004 services, dated cancellations, retained obligations, absence guards and transaction protocol before implementation.
- `src/domain/resolution/engine.ts`: pure deterministic TypeScript over an immutable resource/occurrence snapshot, explicit current time, versioned policy and decisions. Implements Substitute → Swap → Weekday → Online → Saturday, first viable tier/up to three ranked choices, exact qualifications, positive-target substitute ratios/monthly-cover/ID ties, integer score contributions and human-readable rule codes. Checks complete slots, lab suitability/capacity, full availability, approved leave, holidays/semester/current-time boundaries, half-open overlaps and daily/weekly limits, including retained weeks and other semesters.
- Swaps preserve course/teacher/section/duration and validate both destinations atomically. Only eligible future pending same-section/same-type equal-duration classes can swap; previously selected batch assignments cannot be moved by a later swap. The 14-day horizon applies to makeups; swaps may use another future class before leave or later in the semester if both destinations pass. Changing a choice reruns the stable greedy batch; incompatible retained choices are surfaced, never saved as competing reservations.
- Online removes only the room requirement, requires enabled policy, and excludes labs. Saturday is a separate exact-candidate approval tier with recorded earlier-tier explanations. Missing resources leave an obligation unresolved. The default 10,000-attempt limit marks incomplete search and never claims proven infeasibility. Greedy processing is labelled as such, without a global-optimality claim.
- `prisma/schema.prisma`, migration `20261114010000_resolution`: owner/department/approved-leave scoped ResolutionPlan and ResolutionItem, draft edit versions, base/all-department revisions, policy snapshot, exact selected fingerprints, explanations and explicit rejection reasons. Database constraints permit DRAFT only; foreign keys preserve referenced records. Both databases were migrated additively without resets; schema diff is empty.
- `src/server/services/resolutions.ts`, `src/features/resolutions/{schema,actions,components}`, `/resolutions/page.tsx`: scoped Server Component reads, authorized Zod-validated recomputation/saves, actor/dept locking, independent edit-version/revision checks, actor/payload-bound retry receipts and transactional audit. Saves re-solve the selected batch and capture current policy/revisions. Read/compute writes nothing; saving never changes occurrences, reservations, delivery, schedule revision or notifications. Separate managers have separate owned drafts.
- Board: affected-class master/detail layout; static labelled tier ladder; candidate explanations, score/rank disclosures, complete rejected-alternative totals and inspectable groups of 20; required rejection reasons and restore action; keyboard selection; retained choices/retry keys; pending/error/success/stale feedback; explicit recompute and invalid-selection clearing. Mobile stacks; touch disclosures have 48px targets and selectable controls use visible boundaries.
- Leave preview now returns only aggregate provisional greedy coverage estimates for a hypothetical approved absence, avoiding duplicate temporary use of a free interval. `src/server/services/leave.ts`, `src/features/leave/{schema,components}` add the estimate; no other faculty identities/private reasons are returned to the requester. Shell/dashboard/coordinator leave details link to the new board.
- Tests: `tests/unit/resolution.test.ts`, `tests/integration/resolution.test.ts`, `tests/e2e/resolution.spec.ts`, `tests/support/resolution-fixture.ts`; timetable fixture cleanup includes draft dependencies. All records are project-authored synthetic fixtures in isolated `slotwise_auth_test`, with 2099 dates. No test database reset was used.

### Acceptance evidence

| Criterion | Evidence |
| --- | --- |
| 1. Qualified available substitutes, deterministic ordering/reasons | Unit tests check exact qualification, target configuration, ratio, cover count, stable IDs and explanations. |
| 2. Valid equal-duration two-class swaps | Both assignments independently pass hard constraints; invalid incoming leave/duration/section, selected-partner contention and before-leave/beyond-makeup-window boundaries are tested. |
| 3. Competing batch items cannot occupy one resource interval | Unit re-solving exposes the invalid later choice; real service rejects the whole competing draft with no partial plan. |
| 4. Disabled online/labs never offer online | Unit tests check policy/type exclusions, null-room semantics and unchanged teacher/leave constraints. |
| 5. No option remains unresolved | Unit, integration and browser tests show no forced assignment; board retains explicit reasons and empty/unresolved states. |
| 6. Same snapshot/policy gives matching output; incomplete is honest | Frozen snapshots, reversed input ordering, stable ties and an intentionally exhausted search are tested. |

### Commands and actual results

Used Node **24.22.3** via `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`; existing npm packages, PostgreSQL and installed Google Chrome. No install was required.

| Command/check | Actual result |
| --- | --- |
| `npm run db:validate` | Passed; valid schema. |
| `npm run db:test:migrate` / `npm run db:migrate` | Passed; additive migration applied to isolated test and persistent local databases. |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | Passed; empty diff after explicitly matching no-update foreign keys. |
| `npm run db:check` | Passed; real Prisma PostgreSQL SELECT 1. |
| `npm run typecheck` / `npm run lint` | Passed, including tests and the final UI; zero lint warnings. |
| `npm test` | **45/45**, eight files; **13 resolution tests** exercising all tiers, constraints, scoring/ties, immutable snapshots, batch contention and search boundaries. |
| `npm run test:integration` | **59/59**, including **8 resolution tests**: real draft persistence/ownership/revision/policy capture, read-only compute/estimates, direct forbidden/anonymous/revoked/foreign access, exact concurrent retries, competing edits, stale revisions, batch rejection, explicit reasons and late-failure rollback. Existing scheduling/leave/authorization regressions pass. |
| `npm run build` / `npm run check:client-bundle` | Passed; production dynamic `/resolutions`; **34** client bundles contain no Prisma, database URLs or configured secrets. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | **55/55**, including **7 resolution tests**, against a production server and isolated database. All existing auth/master-data/timetable/leave regressions pass. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- tests/e2e/resolution.spec.ts` | **7/7** again after final touch-target/boundary and semantic-markup polish, with a rebuilt production app. |
| Signed-in live development check | Existing coordinator account successfully loaded `http://127.0.0.1:3000/resolutions`; read-only, no runtime/workspace failure, no credentials printed. |
| `git diff --check` | Passed. |

The first new integration run exposed negative zero in integer score contributions: the immediate save returned JavaScript `-0`, while JSON receipt replay returned `0`. Normalized zero contributions; exact retry comparison and all final checks pass. The intentionally injected audit failures log a safe error and prove rollback; they are expected passing tests. No product failure was hidden by changing an assertion.

### Visual/manual checks and demo

- Captured loaded board screenshots at **320/390/768/1440px**, opened representative **1440/390px** screenshots and verified readable course/faculty wrapping, selected states, disclosures and master/detail stacking. Automated checks found no page-wide overflow or axe WCAG A/AA violations on those states. Keyboard-only candidate selection, native disclosure activation, pending/disabled actions, network-error retention, stale recomputation and **200% CSS layout scaling** with reduced motion passed. This is bounded browser QA, not exhaustive assistive-technology verification.
- Browser draft demo selected and reloaded a saved candidate while retaining exactly **12 active reservations**, **2 cancelled originals**, **6 obligations**, semester revision **2**, pending delivery and **zero notifications**. Board responses omit private leave reasons/password data. No publication button exists.
- Repeat: publish future classes using the existing timetable feature, submit leave as faculty, approve as a different HoD, then sign in as coordinator and open **Resolutions**. Inspect reasons/scores/rejections, select/reject/recompute, save and reload your own draft. To show unresolved, use synthetic data where no qualified available option remains; the automated browser fixture covers this state. Faculty **Preview impact** shows provisional estimates only. The persistent seed still publishes nothing; the demo semester ends **2026-12-18**.

### Limitations, concepts and next step

- No feature-005 acceptance criteria remain blocked/unverified locally. Demo-sized department snapshots and bounded deterministic greedy search are intentional; no global optimality, live push or institutional-policy claim is made. Input validation permits up to 200 class decisions and 100 explicit rejections per class. Large-scale search/pagination is future optimization.
- Confirmed-cover counts currently default to zero because delivery records do not exist yet; pure ranking accepts monthly counts for later integration. Substitute invitation/response/expiry, Saturday decisions, meeting URL collection, recovery publication and delivery remain later features. A selected candidate means a draft choice only.
- Inherited ESLint 9 support/deprecation and pg concurrency deprecation notes remain; lint/tests/build pass. No deployment or real university data was introduced.
- React/Next.js concepts: protected Server Components and minimal serializable DTOs, controlled Client Components, `useState`/`useRef`/`useTransition`, typed reusable cards, native accessible disclosures, URL-selected leave, Server Actions, server authorization independent of navigation, route revalidation and inherited loading/error boundaries. Pure domain logic remains separate from Prisma transactions; draft versions, schedule revisions and retry keys solve different problems.
- Updated shared facts in `architecture.md`, `tech.md`, `ui-ux.md`, README and this progress record. Domain policies/specs were preserved.
- Next recommended feature: **006 substitute response and Saturday approval**, only when requested. Stop after feature 005; do not publish resolution plans.

## UI refresh handoff — 2026-11-14

**Scope:** presentation refresh of the implemented application through 005, using the user's supplied health-dashboard screenshot as composition/color inspiration. No 006 workflow was started.

### What changed

- `src/app/globals.css`: charcoal application frame, pale workspace, rounded white panels, lime/lavender/peach highlights, pill controls, refreshed tables/forms/timetable blocks and narrow-card/zoom reflow. Kept reduced motion and visible focus. Draggable class cards use a grab cursor and suppress accidental text selection.
- `src/components/{app-shell,brand,public-shell}.tsx`: icon navigation, selected white pill, account initials, breadcrumb, Lovely Professional University/LPU text branding and a useful timetable shortcut. No official university logo, nonfunctional search or fabricated notification badge.
- `src/app/(app)/dashboard/page.tsx`: real scoped semester/weekly counts, submitted leave counts, upcoming classes, schedule-summary circles and weekly bars using existing read services. Faculty totals filter to the user's faculty profile; students retain membership scope. Empty data remains visible as zero counts and informative states. These are scheduled counts, not attendance or delivered-teaching claims.
- Landing, sign-in and root metadata now use the same identity and palette. Corrected the landing's stale statement that timetable/leave work had not been implemented. Recovery publication remains explicitly pending.
- Updated overview, UI/UX, technology and architecture context so later feature agents follow the new style. The screenshot direction supersedes the earlier blue/flat visual guidance.
- Strengthened existing auth browser checks to await the actual route heading before taking screenshots/auditing streamed pages. Positioned the conflicting drag destination before mouse-down in the existing drag test; the taller cards otherwise caused the test's automatic page scroll to interrupt native drag. Conflict and persisted-position assertions remain intact.
- Preserved pre-existing uncommitted feature-005 work. No deployment, data reseed, schema change, third-party animation package or Git push was performed for this UI task.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed after the application/test edits.
- `npm test`: 45 tests passed across 8 files.
- `npm run build`: production build passed with all existing routes.
- `npm run check:client-bundle`: 34 client bundle files passed; no Prisma, database URL or configured secret value leak found.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: final full run passed all 55 tests in 50.8 seconds, including native drag conflict rejection, 320/390/768/1440 viewport cases, 200% layout zoom, keyboard/menu controls, reduced motion, axe audits and the existing end-to-end workflows.
- Visually inspected desktop/mobile dashboard and desktop sign-in screenshots. Existing browser cases exercise 320/390/768/1440 widths, 200% layout zoom, keyboard/menu controls, reduced motion, axe checks, persisted timetable edits, leave approval and resolution drafts. Final results below distinguish actual passes from pending work.
- Existing inherited lint/pg deprecation notes remain. No institutional-policy or production-readiness claim is added.

### Concepts and next step

The redesign demonstrates reusable React shell/components, responsive CSS Grid, semantic design tokens, container queries, server-rendered authorized aggregates and minimal client interaction boundaries. Existing scheduling validation/services remain the source of truth. Review the refreshed local application; feature 006 is still next only when requested.

## Future UI implementation guidance — 2026-11-14

- Clarified `context/ui-ux.md` as the single UI guide (the file the user calls ui.md). Added exact existing source references, protected-page structure, shared-control and stylesheet reuse rules, and visual/functional handoff checks for new UI files.
- Updated AGENTS.md and the feature-specification common contract so future agents read and apply the latest charcoal/lime/lavender LPU design before creating pages/components. Removed the current-decision wording that still pointed at the superseded blue palette; historical records remain unchanged.
- Documentation-only follow-up. No application logic or styles changed and no feature 006 work began. The most recent application verification remains the UI-refresh run recorded above: 45 unit tests, 55 browser tests, typecheck, lint, production build and bundle checks passed. This does not assert exhaustive behaviour or verification of unimplemented features. The inherited supported-lint-toolchain maintenance limitation remains documented.
- Added explicit feature-specific UI alignment sections and prompt instructions to specs 001–004. They already inherited the shared UI contract; the new wording makes their existing LPU layouts, control reuse and workflow-preservation requirements visible directly in each file. This is documentation alignment, not a request to reimplement completed features.


## Feature 006 handoff — 2026-11-14

**Status:** complete for the requested local-demo scope; all six acceptance criteria verified. Feature 007 was not started. No recovery schedule was published, no dependency installed, no persistent seed request/approval added, and no commit/push/deployment performed.

### Changes and key paths

- Read AGENTS, overview/progress, tech, architecture, domain rules, UI/UX (including future-file guidance), common completion contract and spec 006. Verified actual 005 drafts/fingerprints, pure engine, server scopes, receipts, locks and 003/004 retained obligations before implementation. Preserved the inherited 005/UI work.
- `prisma/schema.prisma`, `prisma/migrations/20261114020000_cover_responses/migration.sql`: SubstitutionRequest and SaturdayException with typed statuses, scoped foreign keys, exact candidate JSON/SHA-256 fingerprints, timestamps, response deadlines and request/decision/closure reasons. PostgreSQL checks enforce valid intervals/decisions and partial unique indexes forbid multiple accepted covers for one teaching obligation and multiple live requests on one item. Applied additively to persistent/local test databases; no reset. Prisma schema diff is empty.
- `src/domain/covers/consent.ts`: pure exact-candidate/canonical identity checks, expiry calculation and inclusive deadline checks. Default response deadline is 24 hours, capped by class start; coordinator input supports 1–168 whole hours as a demo setting, not university policy.
- `src/server/services/covers.ts`: authorized invitations of saved owned ranked candidates; invited active-faculty accept/decline; requesting-manager cancellation; exact Saturday requests and distinct departmental HoD approval/rejection with reasons. Server re-solves the saved entire batch against current qualifications, availability, leave, workload, conflicts and tier ordering. No client-supplied candidate JSON is accepted. Missing eligible approvers are explicit; Admin cannot act as HoD. Actor/Department locking, entity scope before receipt replay, payload-bound retries, consent/audit/Notification/receipt writes and competing-offer cancellation are atomic. Time is read after lock acquisition and rechecked at the response write boundary.
- `src/server/services/consent-store.ts`: effective expiry on every read, locked expiration materialization/events, stable history, durable candidate-change invalidation and exported `assertExactConsent` for later publication. No worker is required. Pending read state becomes Expired immediately; a subsequent authorized mutation persists that terminal state/audit/update. Already accepted responses do not silently expire at their response deadline. `assertExactConsent` supplies consent only; feature 007 must independently authorize and validate scheduling publication.
- `src/server/services/resolutions.ts`, `src/features/resolutions/schema.ts` and `components.tsx`: stable ResolutionItem upserts retain all response history; clearing/changing a saved candidate cancels pending/accepted cover or pending/approved exception. Changing away and back needs new consent. Declined/expired/HoD-rejected exact candidates become server-owned engine exclusions across departmental plans; clearing editable rejections cannot restore them. Terminal responses enter the board freshness token. Historical items that leave the unresolved board remain stored with choices cleared on save.
- `/cover-requests`, `src/features/covers/{schema,actions,components}` and shell navigation: scoped Server Component reads; shared controls/panels; exact course/section/faculty/time/room/deadline; controlled reasons/windows; retained input and retry keys; pending, empty, validation, error, success, expired and stale feedback. HoD earlier-tier reasons include totals and inspectable groups of 20. Existing resolution cards now invite/request only saved selected candidates and expose history. Involved staff receive persisted in-app records; `/cover-requests` shows only the recipient's latest 30 recovery updates. General notification acknowledgement remains 010.
- Tests: `tests/unit/cover.test.ts`, `tests/integration/cover.test.ts`, `tests/e2e/cover.spec.ts`, `tests/support/cover-fixture.ts`; fixture cleanup handles consent dependencies. Fixtures are project-authored synthetic 2099 records in isolated `slotwise_auth_test`; no real university records or persistent demo invitations were created.

### Acceptance evidence

| Criterion | Actual evidence |
| --- | --- |
| 1. Invited faculty accepts before expiry, exactly once | Real database and distinct signed-in browser identities; concurrent exact retry returns identical result and one acceptance audit/update set. |
| 2. Different user or expired invite rejected | Direct anonymous, other faculty, original faculty, student, manager, HoD, foreign department and revoked-user service checks; server read derives expiry without worker; open-browser expired response is rejected. Pure test checks exactly at deadline and one millisecond before; integration also waits past expiry behind a department lock. |
| 3. Competing accept/decline or accepts have one winner | Separate deterministic race tests exercise one invitation and independent owner plans; single terminal winner, losing competing offers cancelled, no pending remainder. A direct database write independently proves the accepted-obligation unique index. |
| 4. Decline/expiry offers next candidate/tier with history | Two real declines advance to another faculty then later tiers; read/compute merges immutable response exclusions; saving/reloading retains history, and client rejections cannot restore a declined candidate. Browser demo completes decline → next invitation. |
| 5. Exact Saturday approval with reason | Separate authenticated coordinator and HoD browser flow; persisted request/decision reasons, earlier-tier explanations, audit reasons, reviewer and exact fingerprint. Own-request/own-leave, missing approver, Admin and foreign HoD checks reject. HoD rejection advances an exact alternative. |
| 6. Changed faculty/time/room cannot reuse consent | Pure canonical checks cover all assignment identity/destination fields and tier. Real service invalidates changed saved choices; exact publication-consent guard rejects changed room/time/faculty/date or stale payload with an old ID; changing back still needs new consent. Current qualification, availability and room changes reject accept/approval. |

Every action leaves occurrences, reservations, obligations, delivery and schedule revisions unchanged. Integration snapshots and browser assertions prove this; pending/accepted/approved never implies publication or delivered minutes.

### Commands and actual results

Used Node **24.22.3** via `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`, existing PostgreSQL and installed Google Chrome. No package installation or database reset.

| Command/check | Actual result |
| --- | --- |
| `npm run db:generate` / `npm run db:validate` / `npm run db:check` | Passed; generated client, valid schema and real Prisma PostgreSQL SELECT 1. |
| `npm run db:test:migrate` / `npm run db:migrate` | Passed; additive 006 migration applied to both databases. |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | Passed; empty migration. Initial migrations-directory diff required an unavailable shadow configuration; switched to the read-only datasource diff. |
| `npm run typecheck` / `npm run lint` | Passed; final implementation, tests and zero lint warnings. |
| `npm test` | **48/48**, nine files, including three new consent/deadline tests. |
| `npm run test:integration` | **73/73**, including **14 cover/exception cases**, with existing scheduling/leave/auth regressions passing. |
| `node --conditions=react-server --import tsx --test tests/integration/cover.test.ts` | **14/14** passed after the final audit reason/fingerprint metadata change. |
| `npm run build` / `npm run check:client-bundle` | Production build passed with dynamic `/cover-requests`; **36** client bundles contain no Prisma, database URL or configured secret leaks. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | **64/64**, including **9 new cases**, against the production app and isolated database. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- tests/e2e/cover.spec.ts` | Final rebuilt app: **9/9** again after the final audit metadata change. |
| Signed-in live development check | Existing coordinator account loaded `/cover-requests` and `/resolutions` on port 3000 with no runtime/workspace failure; read-only, no request submitted and no credential printed. Development app is left running. |
| `git diff --check` | Passed. |

The initial combined race fixture assumed acceptance won its preliminary accept/decline race; if decline won, its next test phase had one fewer faculty candidate. Split these into independent synthetic fixtures to exercise both races without an outcome-dependent setup. Also normalized optional history fields so immediate draft-save responses and JSON receipt replays are identical; the regression test passes. Injected audit failures emit safe error names and prove full rollback; they are expected passing cases. Inherited pg concurrency-deprecation and supported-ESLint-toolchain maintenance notes remain.

### Visual/manual verification, demo and boundaries

- Captured loaded faculty cover cards at **320/390/768/1440px** and HoD approval forms at **390/1440px**; opened/inspected representative desktop/mobile images for both roles. White rounded panels, charcoal actions, responsive stacking, long course names and required reasons match the existing LPU shell. Earlier-tier details show totals plus groups of 20 rather than an unbounded visible list.
- Automated checks for both faculty and HoD views cover all four widths, no page-wide overflow, reduced motion and axe WCAG A/AA. Keyboard-only acceptance and HoD approval, **200% CSS layout scaling**, retained network-error input, pending/disabled controls, empty states, stale eligibility, direct student denial and expiry while the page stays open passed. These are bounded checks, not exhaustive assistive-technology verification. Existing inherited loading/error boundaries wrap the new protected route.
- Demo: approve faculty leave as a different HoD; coordinator opens Resolutions, selects/saves a substitute and sends one invitation. Sign in separately as that invited faculty → Cover & exceptions → Accept or Decline. Recompute as coordinator after decline/expiry. For Saturday, configure Saturday availability/slots, exhaust/reject earlier candidates with reasons, select/save the exact Saturday option, request with a reason and approve as a different departmental HoD with a decision reason. Full steps and demo assumptions are in README.
- No 006 acceptance criteria remain blocked or unverified locally. Demo-sized snapshots and bounded greedy search remain intentional; response/history lists are local-demo scale, with recovery updates capped at 30. Expiry enforcement is immediate on server reads/actions, while physical EXPIRED rows/audit/updates are materialized by a later authorized write; no scheduled notification delivery is claimed. No live push, external delivery, meeting URL collection, general notification acknowledgement, recovery publication or delivered-credit workflow was added.
- React/Next.js concepts: protected Server Components, minimal serializable DTOs, controlled forms and native disclosures, shared typed components, `useState`/`useRef`/`useTransition`, identity-resolving Server Actions and route revalidation. Server authorization is independent of navigation; exact fingerprints, draft versions, schedule revisions, unique indexes and retry receipts address different integrity problems.
- Updated README, overview, architecture, tech, UI/UX and this progress record. Domain rules/spec requirements remain unchanged. Next recommended feature: **007 change preview and publication**, only when requested; stop after 006.

## Verification before GitHub push — 2026-11-14

- User requested a full working-state check and a GitHub push if successful. Verified the implemented scope **000–006**; feature 007 and later roadmap items remain pending.
- Fresh checks on Node 24.22.3: `npm run typecheck`, `npm run lint`, `npm test` (**48/48**), `npm run test:integration` (**73/73**), `npm run build`, `npm run check:client-bundle` (**36 bundles**), `npm run db:validate`, `npm run db:check`, `npx prisma migrate status` (**7 migrations, up to date**), datasource/schema diff (**empty**) and `git diff --check` passed.
- First full production-browser run passed 63/64: the resolution role-switch test navigated to login before the asynchronous sign-out redirect finished (`net::ERR_ABORTED`). Confirmed the competing navigations in the trace. Updated the three affected role switches in `tests/e2e/resolution.spec.ts` and `tests/e2e/cover.spec.ts` to await the login URL and visible email field before signing in again. No application logic or assertion was weakened; no fixed sleeps or retries were added. Typecheck/lint passed again; the final full `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` run passed **64/64**.
- Read-only live browser check on port 3000 used the existing synthetic ADMIN, COORDINATOR, HOD, FACULTY and STUDENT accounts: **23 authorized route visits** passed, no browser runtime errors, and direct student access to Cover & exceptions was denied. Submitted no persistent requests and changed no live schedule or credentials.
- Fetched `origin`; local `main` initially matched `origin/main`. Checked changed/new files for configured secret values and private-key/token patterns; none found. Real environment files, generated Prisma output, build files, browser traces and screenshots remain ignored. The verified change set is ready for the user-authorized commit and push; no deployment is included.
- Existing pg-driver deprecation and supported-lint-toolchain maintenance notes remain; no new failed check or unfinished feature-006 criterion was found. The next product feature remains 007, only on request.

## Feature 007 handoff — 2026-11-14

**Status:** complete for the requested local-demo scope. All seven acceptance criteria verified. Work stops after 007; delivery/ledger (008) was not started. No dependency installation, persistent demo publication, data reset, commit, push or deployment.

### Changes and key paths

- Read AGENTS, overview/progress, technology, architecture, domain rules, UI/UX/future-file guidance, common completion contract and scheduling specs 003–008. Verified actual 003 transactions/reservations, 004 retained obligations, 005 saved batches and 006 exact consent before implementing 007.
- `src/server/services/publications.ts`, `src/features/publications/{schema.ts,actions.ts,components.tsx}`: authorized read-only selected-subset preview and separate atomic publication. Preview shows exact Before/After teacher, local date/time, room/mode, recipients, unresolved units and specific consent/link blockers. Final standard Publish action follows the comparison. Controlled checkboxes/links, pending protection, retained failed input/retry identity, inline success/error/stale states and existing route loading/error boundaries reuse the LPU shell and Button/Input.
- Publication uses sorted actor/assignee User locks before the shared Department lock; reloads current role/scope; checks owned entity before receipt replay; validates draft version and department revision/policy token; rebuilds the selected subset against actual dated resources; rechecks leave, obligations, qualifications, availability, limits, accepted exact cover and exact Saturday approval. Online requires a credential-free HTTPS meeting URL. Class start is checked after waiting for locks and again immediately before receipt creation. Successful receipt replay precedes stale rejection; altered payload/key ownership is rejected.
- `prisma/schema.prisma`, migrations `20261114030000_recovery_publication` and `20261114031000_recovery_entry_identity`: SchedulePublication details, plan/item lifecycle and publication links, online room/mode checks and history-compatible entry/date uniqueness. Stable obligation uniqueness and PostgreSQL half-open resource exclusion remain. An actual makeup test exposed that a recovery may share a template entry/date with a different week's class at another time; the second additive migration corrects that index while preserving already applied migration history. Both databases migrated without resets.
- Linked replacements preserve original cancellations and required obligations/minutes, including substitutes at the original time. Swaps release all old resources before creating both replacements. Occurrences/reservations, publication details, selected items, superseded leftovers, affected-semester revisions, safe audit, per-recipient in-app notifications and actor/payload-bound receipt commit together. Delivery stays PENDING. Published consent history cannot be cancelled as an invitation. Recompute/save restores only remaining unresolved items to DRAFT and preserves committed item history.
- `scheduling-store.ts`, `timetable.ts`, `resolutions.ts`: reusable actual-assignment snapshot; dated template conflict checks and master-data guards now respect assigned substitutes, online rooms and published Saturday recovery. `/timetable` displays original-date replacement labels, safe meeting links and Saturday when present. `covers.ts`/cover components label committed consent Published. `leave.ts`/leave components distinguish historical cancellations from actual unresolved units. Protected route descriptions now reflect available publication.
- `tests/integration/publication.test.ts`, `tests/e2e/publication.spec.ts` and fixture cleanup cover real PostgreSQL and signed-in browser workflows using project-authored synthetic 2099 records only in `slotwise_auth_test`.

### Acceptance evidence

| Criterion | Actual evidence |
| --- | --- |
| 1. Complete selected batch commits together | Two-item makeup commit; exact accepted substitute; approved Saturday; validated online; atomic two-sided swap. Assertions inspect occurrence links, reservations, plan/items, publication details, revisions, safe audit, recipients and receipt. Preview snapshots prove no writes. |
| 2. One invalid/conflicting item rolls everything back | Multi-item eligibility change and an actual destination conflict inserted after preview without revision advance both reject the entire selected batch. Test-only late Notification and MutationReceipt failures compare full before/after state, including reservations/history, consent, plans/items, publications, revisions, audit, updates and receipts. Separate swap failure restores both sides. Same request succeeds after fault removal. |
| 3. Stale preview requires recomputation | Changed own/other semester set, changed draft version and changed consent reject old previews. Browser verifies stale result → retained selection → recompute → save → new preview → publish. |
| 4. Successful retry creates no duplicates | Concurrent same-key requests return identical committed result after the revision advances. Repeated retry preserves one publication and notification set; altered payload, preview fingerprint or actor/key reuse rejects. Current revoked/changed-role actor cannot replay. |
| 5. Resource races have at most one winner | Separate owners publish different obligations targeting the same faculty/section/room interval: exactly one commits, loser is stale, and pairwise reservation checks find no overlap. Simultaneous substitute qualification archival/publication has exactly one valid outcome. Actor revocation and exact class-start-after-lock boundaries reject writes; a coordinated NOWAIT test proves proposed assignee locks are held while waiting on Department. Existing PostgreSQL exclusion tests remain passing. |
| 6. Unselected items remain unresolved | Subset publication leaves the other obligation without an active occurrence, marks its item SUPERSEDED, rejects its old preview and requires recompute/save. A subsequent valid publish retains prior committed items. Leave details show one then zero unresolved units; browser reload displays the remaining class. |
| 7. Rescheduling preserves requirements and delivery | Before/after obligation records remain identical across all makeups and swaps. Originals/history persist; replacements reference the same obligations with unchanged duration and PENDING delivery. Student timetable reads/browser refresh show published coverage without earned minutes. |

Direct service checks additionally reject anonymous, faculty, HoD, student, wrong-department, other draft owner, revoked/changed-role access and forged/duplicate client fields. Candidate/consent changes and expired-at-start options cannot silently authorize publication. Accepted response deadlines may pass without revoking already accepted exact consent; current eligibility and class start still apply.

### Commands and actual results

Used Node **24.22.3** via `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`, existing PostgreSQL and installed Google Chrome. No package changes.

| Command/check | Actual result |
| --- | --- |
| `npm run db:generate`, `npm run db:test:migrate`, `npm run db:migrate` | Passed; current client and both additive migrations applied to isolated/persistent local databases. |
| `npm run db:validate`, `npm run db:check`, `npx prisma migrate status` | Passed; schema valid, real SELECT 1, nine migrations up to date. |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | Empty migration. |
| `npm run typecheck`, `npm run lint` | Passed; zero lint warnings. |
| `npm test` | **48/48** unit tests across nine files. |
| `npm run test:integration` | Final run **92/92**, including **19 new publication cases** and all prior authorization/scheduling/consent regressions. |
| `npm run build`, `npm run check:client-bundle` | Passed; production routes compiled and **36** bundles contain no Prisma, database URLs or configured secrets. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e -- tests/e2e/publication.spec.ts` | **10/10** feature browser cases passed; final full suite also covers the finished UI. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Final production build **74/74** passed in 1.2 minutes. |
| `git diff --check` | Passed. |

Early checks exposed the template-date identity issue above, one existing approved-leave error-message assertion and two overbroad new browser locators. Corrected the index/guard ordering and scoped the locators; no assertion or authorization rule was weakened. A test helper TypeScript narrowing error was fixed before the successful final build. Test-only failure injection emits safe Prisma error names and is expected in passing rollback cases. Final diff review also caught and corrected an unintended documentation overwrite; technology history is preserved with only the intended new section. Inherited pg concurrency-deprecation and ESLint support-maintenance notes remain.

### Visual checks, demo and boundaries

- Captured loaded publication review panels at **320/390/768/1440px** and inspected final **390/1440px** screenshots. Long course/faculty names wrap; Before/After stacks on phones; charcoal controls/checkboxes, lavender after-state, semantic blockers, visible focus and final Publish action match the existing LPU workspace.
- Automated browser verification at all four widths checks no page-wide overflow, keyboard disclosure/publication, reduced motion, **200% CSS layout zoom**, zero page runtime errors and axe WCAG A/AA. Flow checks include pending/disabled input, retained network-error retry, missing acceptance, invalid meeting links, stale recovery, empty/unresolved state through the inherited board, student denial/refresh, exact invited-faculty acceptance and separate HoD Saturday approval. These are bounded checks, not exhaustive assistive-technology verification.
- Demo: approve leave as a different HoD → coordinator selects/saves candidates → invited faculty accepts or separate HoD approves Saturday where required → coordinator checks a saved subset under **Preview and publish** → **Preview selected changes** → review Before/After, recipients, blockers and unresolved items → **Publish N changes** → student refreshes Timetable. For a stale demo, change a room name or publish another recovery from a separate authorized session while a preview stays open; then try that old preview and recompute/save/review after rejection. README contains the detailed flow.
- No 007 acceptance criterion remains blocked or unverified locally. Intentional local-demo boundaries remain: bounded greedy search/snapshots; URL structure validation does not verify meeting reachability/provider ownership; in-app records have no external delivery or live push. General acknowledgement/audit viewers and delivery/ledger remain 010/011 and 008. No university-policy, deployment or production-readiness claim is added.
- React/Next.js concepts: protected Server Components, safe serializable DTOs, controlled state, `useState`/`useRef`/`useTransition`, shared typed controls, native disclosures, validated identity-resolving Server Actions and route revalidation after commit. The server owns authorization and schedule truth; preview fingerprints, draft versions, schedule revisions, user/department locks, exclusion constraints and retry receipts protect distinct boundaries.
- Shared facts updated in README, overview, architecture, technology, UI/UX and this progress record. Domain rules and feature requirements are unchanged. Next recommended feature: **008 delivery confirmation and contact-minutes ledger**, only on a separate request.

## Feature 007 verification before GitHub push — 2026-11-14

- User requested a fresh working-state review followed by a GitHub push. Reviewed the feature-007 spec, shared transaction/permission rules, publication service/UI, migrations and actual acceptance tests. Scope remains 000–007; feature 008 was not started.
- Found and reproduced one independent database-constraint gap: PostgreSQL CHECK accepts UNKNOWN, allowing a NULL online meeting link despite correct service validation. Added non-destructive migration `20261114032000_recovery_online_link_check` with an explicit non-NULL requirement and a regression test covering NULL/HTTP links and invalid room/mode combinations. The new test failed before the fix and passed afterward. Applied migration to both local databases without resetting data or publishing persistent demo classes.
- Fresh final Node 24.22.3 checks passed: `npm run typecheck`, `npm run lint`, `npm test` (**48/48**), `npm run test:integration` (**93/93**, including **20 publication cases**), `npm run build`, `npm run check:client-bundle` (**36 bundles**), and `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` (**74/74** in 1.2 minutes). Race conditions, exact consent, unauthorized operations, stale recovery, atomic late rollback, pending/retry handling and student timetable refresh all pass.
- `npm run db:validate`, `npm run db:check`, `npx prisma migrate status` (**10 migrations, up to date**) and datasource/schema diff (**empty migration**) passed. `git diff --check` passed. Existing pg-driver deprecation and supported-lint-toolchain maintenance notes remain; no failed feature-007 acceptance criterion remains.
- Fetched `origin`; local `main` matched `origin/main` before this change. Scanned all changed/new files for configured secret values and private-key/token patterns; none found. Real environment files, generated client/build files, screenshots and traces remain ignored. This verified feature-007 change set is ready for the user-authorized commit/push; no deployment is included.


## Feature 008 handoff — 2026-11-14

**Status:** complete. All six numbered acceptance criteria verified locally. Features 009 onward were not implemented. No new dependency, persistent demo publication, commit, push or deployment.

### What changed

- Added `prisma/migrations/20261114040000_delivery_ledger/migration.sql` and DeliveryRecord schema relations: scoped obligation/occurrence/confirmer foreign keys, retained correction records, unique current record per occurrence and unique current HELD credit per obligation. A database trigger independently checks obligation identity and full duration. ResolutionPlan has exactly one explicit approved-leave or not-held-occurrence source. Applied additively to both databases without resetting data.
- Added `src/domain/delivery/ledger.ts`, `src/features/delivery/{schema,actions,components}.ts[x]`, `src/server/services/delivery.ts`, protected `/delivery` and `/classes-owed` pages. Faculty/HoD profiles can confirm their assigned ended classes; coordinators can confirm/correct with an audit reason. Admin/HoD ledger permission alone does not grant correction authority. Typed strict commands reject forged actor/minute fields. Semester URL filters, explicit refresh, pending/empty/error/success/history/stale states reuse AppShell and Button/Input.
- Delivery writes serialize through User→Department locks, reload current permission/scope, authorize the occurrence before receipt replay, check end time after locking, and compare the exact current record on correction. Record retirement/replacement, delivery status, past reservation release for NOT_HELD, schedule revision, safe audit and actor/payload-bound receipt commit together. A HELD correction never resurrects reservations or overrides a published replacement. Same successful retry returns its receipt before stale rejection; changed keys/payloads/actors cannot reuse it.
- Ledger reads derive required allocation targets, uniquely delivered obligation credit, future planned coverage, outstanding and overdue minutes from authoritative records. Due time is the earliest scheduled end in an obligation history; future requirements are outstanding without becoming overdue. A future recovery does not erase existing overdue minutes. Unmaterialized allocation requirements have no invented due time. Clients maintain no delivery counters.
- Updated `resolutions.ts`, `publications.ts`, `covers.ts`, resolution UI and `scheduling-store.ts`: ordinary not-held leaf occurrences enter the existing engine/publication workflow without a second requirement or fake leave request. A missed published recovery can be recovered again using the same obligation. Original leave provenance remains in retained history; exact Saturday consent excludes the assigned teacher and original leave owners from self-approval. Monthly confirmed-cover ranking uses current HELD tier-1 delivery records and reverses after correction. Existing exact consent, resource exclusion and batch publication protections remain.
- Updated navigation and route revalidation in timetable, leave and publication actions. Added `tests/unit/delivery.test.ts`, `tests/integration/delivery.test.ts`, `tests/e2e/delivery.spec.ts`, `tests/support/delivery-fixture.ts`; extended isolated fixture teardown for recovery-source references and updated one old empty-board text assertion. README and owning context files describe the actual flow and boundaries.

### Acceptance evidence

| Criterion | Verified evidence |
| --- | --- |
| 1. Reject premature confirmation | Real service rejects future/ongoing classes, including one millisecond before end; exact-end controlled-clock confirmation succeeds. Server time is read after lock acquisition. |
| 2. Ended assigned class credits once | Faculty and reasoned coordinator confirmations persist full-duration records. Concurrent same-key retry and duplicate same-outcome requests leave one current record and one earned 60-minute obligation. |
| 3. Original/replacement cannot double count | Actual missed→published makeup→ended HELD chain earns 60 once. Correcting its replaced predecessor is rejected. PostgreSQL independently rejects a second HELD record on a distinct occurrence for that same obligation, plus mismatched identities and partial credit. |
| 4. Planned/accepted makeup earns nothing | Real accepted substitute and future published recovery leave ledger delivered minutes at zero. Future planned minutes remain separate; original overdue/outstanding/required totals survive rescheduling. |
| 5. Reasoned correction updates totals and audit | HELD→NOT_HELD→HELD reverses/restores totals while retaining all three records and both correction audit reasons. Same-key correction retries are idempotent; competing different-key corrections have one winner and one stale result. Late audit and receipt failures restore records, occurrences, reservations, revisions, audit and receipts exactly. |
| 6. Not-held remains recoverable without a new requirement | Browser correction→ordinary recovery→publication retains the original obligation, null leave source and zero earned minutes. Integration repeats recovery after another missed replacement. Correction versus publication race has exactly one winner. A missed substitute preserves original leave ownership for separate HoD Saturday review. |

Direct checks also cover anonymous/student/wrong-teacher/admin/HoD/cross-department mutation denial, faculty ledger denial, semester scope, revoked/changed-role receipt replay, actor revocation while waiting for its lock, strict inputs and safe DTOs without private leave reasons.

### Commands and actual results

Used Node **24.22.3** via `PATH=/tmp/slotwise-node/node_modules/node/bin:$PATH`, existing local PostgreSQL and installed Google Chrome. Final results:

| Command | Actual result |
| --- | --- |
| `npm run db:generate`, `npm run db:test:migrate`, `npm run db:migrate` | Passed; generated current client, additive migration applied to isolated/persistent databases. |
| `npm run db:validate`, `npm run db:check`, `npx prisma migrate status` | Passed; valid schema, real SELECT 1, **11 migrations up to date**. |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | Empty migration. |
| `npm run typecheck`, `npm run lint` | Passed; zero lint warnings. |
| `npm test` | **54/54**, ten files, including six new ledger/validation unit cases. |
| `npm run test:integration` | Final **111/111**, including **18 delivery cases** and all prior auth/scheduling/consent/publication regressions. |
| `npm run build`, `npm run check:client-bundle` | Passed; both new dynamic routes compiled; **39 bundles** checked without Prisma/database URLs/configured secrets. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Final **84/84** in 1.4 minutes, including **10 delivery/ledger cases**. |
| `git diff --check` | Passed. |

Early checks caught a test clock API misuse, fixture-teardown reference cycle, JSX-in-try lint violation and unreadable mobile table compression. Corrected these before the final passing checks; removed the three abandoned fixtures from the initial teardown failure only in `slotwise_auth_test`. Final screenshot inspection confirms readable table widths with intentional internal scrolling. Test-only late-failure injection logs safe Prisma error names in passing rollback tests. Inherited pg-driver deprecation and ESLint support-maintenance notes remain.

### Visual verification, demo and limits

- Loaded both screens at **320/390/768/1440px** with long course names, native keyboard history disclosures, explicit focus, reduced motion, **200% layout zoom**, no page-wide overflow, zero page runtime errors and axe WCAG A/AA scans. Verified keyboard scrolling inside the labelled ledger region. Inspected final **390/1440px** delivery and ledger screenshots; active actions appear first, schedule/delivery labels remain separate and metric headers/numbers no longer break into letters. General loading/error UI inherits the already verified protected route boundaries.
- Browser workflow verifies faculty keyboard confirmation and visible success after its form closes; reasoned coordinator confirmation/correction; retained history and totals; ordinary not-held recovery publication; network failure/pending/retry; stale correction with retained reason and explicit latest-record review; student route denial; HoD/admin ledger-only access and empty semesters.
- Demo: open **Class delivery** for an ended assigned 60-minute class → confirm **Held** → coordinator opens **Classes owed** to see 60 delivered → coordinator corrects to **Not held** with reason → inspect both history states and restored overdue minutes → **Arrange recovery for this obligation** → save/preview/publish → verify required/outstanding stay unchanged and delivered remains zero until the recovery ends and is confirmed. README provides the repeatable immediate isolated-browser test command. Persistent seed records publish no past classes; a manual fresh-database demo must wait for a valid published class to end.
- No 008 acceptance criterion remains blocked or unverified locally. Deliberate boundaries: full-duration confirmation only; no split recovery/attendance; the inherited 14-day/semester search horizon can honestly leave old obligations unresolved; correcting an already replaced predecessor needs a separately reviewed schedule reversal outside MVP. No production-policy, deployment, full screen-reader or external-message claim is made.
- React/Next.js concepts: protected Server Components and minimal serializable DTOs; controlled Client Components with `useState`, `useRef`, `useTransition`; native semantic forms/tables/disclosures; identity-resolving, Zod-validated Server Actions and route revalidation after commit. Server authorization, current-record identity, stable obligations, transaction locks, partial unique indexes and receipts each enforce a separate boundary.
- Shared context updated in overview, architecture, technology, domain rules (source identity, reason and due-time semantics), UI/UX, README and this progress record. Next recommended feature: **009 workload and impact dashboards**, only on a separate request.

## Feature 008 verification before GitHub push — 2026-11-14

- Reviewed delivery and ledger against feature 008, including permissions, separate scheduling and delivery states, unique obligation credit, correction history and the LPU UI. Found that Leave undercounted unresolved obligations after a published substitute was marked Not held. Updated `src/server/services/leave.ts` to count stable obligations across replacement history. Updated the Leave and Resolutions text to distinguish active coverage, delivery and where to find missed replacements.
- The regression assertion initially failed with one unresolved obligation where two were expected. It now passes and verifies the count returns to one after a coordinator confirms delivery by correction, even while the occurrence remains cancelled for scheduling. The existing permission, concurrency and rollback coverage also passed.
- Fresh Node 24.22.3 runs passed `npm run typecheck`, `npm run lint`, `npm test` (**54/54**), `npm run test:integration` (**111/111**), `npm run build`, `npm run check:client-bundle` (**39 bundles**) and `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` (**84/84**). Browser checks covered 320–1440px reflow, 200% layout zoom, keyboard scrolling and axe. Inspected fresh mobile delivery and desktop ledger screenshots.
- `npm run db:validate`, `npm run db:check`, `npx prisma migrate status` (**11 migrations up to date**) and `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (**empty migration**) passed. The connectivity check was rerun after Prisma generation finished. No migration changes were needed for the reporting fix. `git diff --check` passed.
- Reviewed the 34 changed and new files for configured secret values and credential patterns. The scan found none, and environment files, generated output and browser artifacts remain ignored. Feature 009 remains the next separate task.


## Feature 009 handoff — 2026-11-14

**Status:** complete locally. All five acceptance criteria verified. The dashboards use the existing database and dependencies.

- Added protected `/workload` and `/reports` pages, shared date and chart components under `src/features/insights`, feature CSS in `src/app/globals.css` and role-aware AppShell links. GET date filters, refresh timestamps, formula disclosures, empty and validation states, and keyboard-scrollable tables reuse the LPU workspace. The existing protected loading and error boundaries supply route-level feedback.
- `src/server/services/insights.ts` reads scoped PostgreSQL snapshots and selects only the inputs needed by `src/domain/workload/metrics.ts`. Workload counts active published assignments once, on the assigned faculty member; current Held records supply delivered minutes and Held tier-1 cover counts. Utilization uses each person’s current full weekly target. The recovery cohort uses the approved-leave-affected class date and counts obligations across replacement history. Revalidation follows relevant timetable, leave, publication, delivery and master-data operations.
- PostgreSQL tests verified different targets, assigned cover attribution, inclusive date boundaries, the 2/5 weekday rate alongside 1 Saturday and 2 unresolved, one confirmed delivery, later makeup confirmation, duplicate replacement history, delivery corrections, a concurrent uncommitted schedule change, unauthorized actors and forged department filters. Unit tests cover missing/zero targets, exact balance thresholds and the empty denominator. The current master-data schema requires positive configured targets; missing/zero handling is verified at the metric layer.
- Test data is project-authored and isolated in `slotwise_auth_test`. The production build used the existing local configuration. The repeatable demo creates and removes fixtures in the isolated database. The report uses the current schedule and delivery state. Historical target snapshots and a baseline for Saturdays avoided are outside this feature.
- Browser checks cover matching chart and table values, keyboard filters and table scrolling, invalid and empty periods, faculty-only data, unauthorized URLs, axe WCAG A/AA, reduced motion and 200% layout zoom at 320, 390, 768 and 1440 px. Inspected representative mobile and desktop captures for both routes. Accessibility verification covers semantic markup and automated scans. A manual screen-reader session remains unverified.
- Demo as HoD or coordinator by opening **Workload** and **Reports** and choosing periods with published assignments and approved leave. The README has the repeatable browser fixture command. React/Next.js concepts include protected App Router Server Components, shareable URL parameters, reusable typed components and cache revalidation after Server Actions.
- Shared facts updated in the README, overview, architecture, domain rules, UI/UX and technology context. Next feature on request is **010 notifications and acknowledgement**.

### Verification

| Command | Actual result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | Passed on Node 24.22.3. |
| `npm test` | 56/56 passed. |
| `npm run test:integration` | 115/115 passed, including 4 reporting cases. |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | 90/90 passed, including 6 reporting cases. |
| `npm run check:client-bundle` | 41 bundles checked. |
| `npm run db:validate`, `npm run db:check`, `git diff --check` | Passed. |

Initial checks surfaced a missing fixture decision timestamp, an unused import and TypeScript result narrowing. Corrected all three and removed three incomplete fixtures from the isolated database. The inherited pg deprecation and ESLint support maintenance notes remain.

## Feature 009 verification before GitHub push — 2026-11-14

- Rechecked all five acceptance criteria and reviewed the role scope, reporting inputs, replacement history and chart/table agreement. The fresh browser run exposed an existing publication keyboard-test race: the test could focus the preview button before the draft-save transition enabled it. Updated the test to wait for enabled controls and send Enter to the target buttons. All five repetitions and the full rerun passed.
- Fresh checks passed on Node 24.22.3: `npm run typecheck`, `npm run lint`, `npm test` (56/56), `npm run test:integration` (115/115), `npm run build`, `npm run check:client-bundle` (41 bundles), and `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` (90/90). `npm run db:validate`, `npm run db:check`, Prisma migration status (11 current), the database-to-schema diff (empty) and `git diff --check` also passed.
