# SlotWise technology

## Status

Feature 000 installed the foundation on 2026-11-12. Features 001 and 002 added local authentication and persistent scoped master data on 2026-11-13; later-feature libraries remain planned. Feature 002 adds no dependencies. Actual versions and checks are recorded below. The proposal's Next.js 15 is not a version requirement. Keep a compatible non-prerelease dependency set and one npm lockfile; follow a course-mandated major if one is supplied later. Git is initialized on `main` with origin `https://github.com/rajveer3x/slotwise.git`; the initial README commit is pushed, and foundation/auth source is included in the subsequent local feature commit.

## Selected implementation defaults

| Concern | Default | Reason |
| --- | --- | --- |
| Framework | Next.js App Router, React, TypeScript strict mode | Course focus; one full-stack application |
| Styling | Tailwind CSS, shadcn/ui primitives, Lucide icons | Consistent reusable interface |
| Design system | Semantic tokens and layouts in ui-ux.md; Inter or system font | Charcoal frame, pale workspace, lime/lavender accents and LPU text branding |
| Validation/forms | Zod; React Hook Form for complex forms | Shared input shape, server validation remains mandatory |
| Database | PostgreSQL with Prisma | Relationships, migrations, transactions |
| Authentication | Auth.js with credentials for local demo | Server sessions and role enforcement; verify selected-version integration |
| Password hashing | Argon2id with maintained library | Never store plaintext passwords |
| Scheduling grid | CSS Grid; dnd-kit when feature 003 needs it | Custom interaction and keyboard alternatives |
| Charts | Server-rendered CSS bars and semantic tables | Workload and leave recovery visualization |
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
- `db:seed` is explicit, refuses production/missing or short passwords, creates five synthetic `.test` identities, and preserves existing accounts and hashes. Feature 001 originally seeded identities only; feature 002 extends the explicit seed with linked synthetic teaching data in two departments while preserving existing records. The ignored local `.env` contains generated local-only auth/seed secrets; `.env.example` leaves those values blank.
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

## Feature 002 master-data decisions

- `/admin` is the ADMIN/COORDINATOR master-data workspace. Existing ADMIN-only account access moved to `/admin/accounts`; the service permissions are unchanged. Search/category/archive filters use URL parameters. Reads remain Server Components; controlled Client Component forms use `useActionState`, field feedback, pending controls and explicit stale refresh.
- The incremental schema adds Semester, Holiday, Faculty, FacultyAvailability, Course, FacultyQualification, Section, SectionMembership, Room, TimeSlot, CourseAllocation and MasterMutationReceipt. Relation keys include departmentId; database constraints enforce positive values, valid local intervals, calendar dates and one unarchived active semester per department. Weekdays use ISO 1–6 and local times use minutes since midnight. Calendar-only dates remain canonical YYYY-MM-DD strings with date-validating PostgreSQL checks, avoiding accidental timezone conversion.
- Mutation services lock/reload the actor, lock the department, validate relationships, check per-record versions and commit writes plus actor/payload-bound receipts atomically. Same-request retries return the committed result before stale-version rejection. This is master-data serialization, not the future scheduling reservation protocol. Requests get server-generated UUIDs and rotate after successful submissions. SQL/Prisma errors return safe user feedback.
- All removal uses reversible archival; codes/relationships remain unique across archived rows. Existing foreign keys are preserved; new and restored relationships require unarchived, scoped parents. Identity fields marked fixed cannot change after creation to avoid silently relinking dependent history; allocation faculty remains editable with qualification/scope checks. React form values survive validation errors; explicit page refresh loads current defaults and deliberately replaces unsaved input.
- `prisma/demo-fixtures.ts` owns deterministic project-authored fixtures. Existing feature-001 addresses are preserved; Computing adds faculty2–faculty6 and student2 at `@demo-computing.slotwise.test`, while Design uses `@demo-design.slotwise.test`. Seed operations use transactional create-only upserts, preserve edits/passwords/access, refuse production and perform no resets. Tests use their own namespace and the existing isolated test database.
- Department's typed `onlineTeachingEnabled` defaults false; semester scheduleRevision starts at zero. No publication, reservations, account provisioning or role editing was added. Future publication must guard all affected master-data paths (including availability/room changes) using the scheduling transaction protocol.


## Feature 003 timetable decisions

- No dependency was added. `/timetable` uses a project-owned semantic table/CSS grid of controls, a mobile agenda and native HTML drag events. The explicit move form handles keyboard/touch; dnd-kit was unnecessary for this scope. Interactive state uses React `useTransition`, refs and controlled fields; published reads and URL filters remain Server Components.
- The schema/migration adds timetable versions/entries, stable obligations, dated occurrences, active reservations, scheduling receipts, audit events and minimal recipient notifications. PostgreSQL `btree_gist` supplies a half-open timestamptz exclusion constraint; migration permission to install that extension is required. It was available in the local PostgreSQL 17 environment.
- The institution-time conversion is intentionally Asia/Kolkata; unsupported department timezones fail explicitly. No timezone package, solver, AI integration, background worker or external messaging was added. Availability covers adjacent intervals; labs require at least two contiguous configured slots.
- The persistent local database and isolated test database receive migration `20261113010000_timetable`. Existing demo records are preserved; no weekly timetable is generated or automatically published. Tests use separate synthetic 2099 semesters to avoid wall-clock timing flakiness.
- Some Prisma relation reads emit the installed pg driver's concurrency deprecation warning; checks pass with the installed pg 8 version. Scheduling snapshot queries themselves are sequential. This warning is a future driver-upgrade compatibility consideration, not a failed transaction in the recorded checks.


## Feature 004 leave decisions

- No dependency was added. `/leave` uses Server Component reads, controlled React forms, `useTransition`, ref-based duplicate protection and retained retry UUIDs. Server Actions revalidate `/leave`, `/timetable` and `/dashboard` only after committed mutations; impact previews write nothing. Browser refresh detects changed semester revisions without discarding request fields.
- Incremental migration `20261114000000_leave` adds typed LeaveStatus/LeaveRequest, scoped foreign keys, decision/date checks, and an optional leave link on ClassOccurrence. It reuses feature 003's `btree_gist` extension for inclusive local-date exclusion of overlapping pending/approved leave; `make_date` expressions keep the index immutable. Applied to both local databases without resets.
- Request private reasons are optional, capped at 2,000 characters; rejection requires a nonempty decision reason. Both are returned only to the owner/departmental HoD. Audit payloads contain safe status/date/occurrence/revision data, never either reason. Scheduling MutationReceipt is reused with a feature-scoped payload fingerprint.
- Synthetic tests use unique isolated departments and 2099 dated timetables, plus controlled same-day/boundary records; no leave requests or published schedules were added to the persistent demo seed. Approved leave cancellation is linked for later resolution work. No candidate counts, recovery engine, notifications UI or reversal workflow was added.


## Development Prisma cache recovery

`server/db.ts` retains one client across ordinary hot reloads and records the generated Prisma constructor with it. In development, a regenerated constructor (or a legacy untagged cache) retires the old client/pool and creates a current client. Production cache reuse is unchanged. Compare the recorded constructor reference rather than `instanceof`: the installed Prisma client returns a proxy that does not reliably pass that test. This avoids missing model delegates after a running development server survives a schema addition. Schema regeneration still does not apply database migrations; use the explicit database scripts. Restart the development server if it retained stale compiled modules.


## Feature 005 resolution decisions

- No dependency was added. `domain/resolution/engine.ts` implements the five-tier ladder and versioned integer scores in pure TypeScript, with deterministic code-point ID ties, a 14-day makeup horizon and 10,000 attempted candidates per item. At most three ranked choices are shown; a limit marks search incomplete. These are demo policies, not institutional claims.
- Migration `20261114010000_resolution` adds owner-scoped ResolutionPlan/ResolutionItem, captured revisions/policy, exact choices, explanations and rejections. Database constraints allow DRAFT only in this feature. Both local databases were migrated without resets; no schedule was published or fixture added to the persistent demo data. The schema explicitly matches the new foreign keys' no-update behavior.
- Resolution reads use repeatable-read transactions; saves use the existing actor/department lock and idempotency receipt protocol. The snapshot token covers all department semester revisions, leave version and policy including the online setting. Draft edit versions prevent competing edits overwriting each other. Drafts never reserve resources or increment schedule revisions.
- `/resolutions` uses Server Component reads, small controlled Client Components, `useTransition`/refs, Server Actions, native disclosures, retained retry UUIDs and explicit recomputation. Rejected alternatives load in groups of 20; all searched results remain inspectable. Faculty impact previews return only provisional aggregate coverage estimates, not other faculty details.
- Feature 005 initially supplied zero confirmed-cover inputs; feature 008 now derives real monthly counts from unique current HELD tier-1 delivery records. Responses/expiry and Saturday decisions belong to 006, publication to 007. The engine uses current active dated assignments, including boundary weeks and other semesters, without inventing reservations or coverage.


## Feature 006 cover/exception decisions

- No dependency was added. Incremental migration `20261114020000_cover_responses` adds typed cover/exception statuses, exact candidate snapshots and SHA-256 fingerprints, scoped foreign keys, interval/decision checks and partial unique indexes for accepted obligations/live item requests. Applied additively to both local databases without resets; Prisma schema diff is empty.
- Existing resolution items now retain stable identities through upserts so response history survives draft edits. Cover/exception writes reuse actor/Department locks, transactional audit/Notification records and MutationReceipt. No scheduling reservation, revision increment, background job, external messaging or persistent seed publication is introduced.
- Expiry is checked from server time on reads/actions, after lock waits and at the response write boundary. Default 24 hours is capped by class start; coordinator input permits 1–168 whole hours as a demo assumption. Reads project expired state without writing; authorized mutations materialize expiry/history. These are response deadlines; already accepted consent does not silently expire at the response deadline.
- `/cover-requests` uses protected Server Component reads and controlled Client Components. Responses are possible only for the invited active faculty; exact Saturday requests require separate HoD decisions/reasons with requester/leave-owner self-approval denied. Server-owned response exclusions drive next-candidate/tier recomputation; saved candidate changes durably cancel consent.
- Tests use project-authored synthetic 2099 fixtures only in `slotwise_auth_test`. `assertExactConsent` is provided/tested for feature 007's publication transaction; publication must still revalidate every scheduling constraint and current actor permission. Feature 006 does not implement recovery publication or delivery.


## Feature 007 recovery publication decisions

- No new dependency. The existing React/Next.js, Prisma/PostgreSQL, Zod and test stack implements preview and publication within `/resolutions`.
- Additive migrations `20261114030000_recovery_publication` and `20261114031000_recovery_entry_identity` add immutable application publication details, plan/item lifecycle checks, nullable online rooms with mode/URL constraints, and a template-only active entry/date index. The second migration corrects an overly strict index found by the real makeup tests; already applied migrations were preserved. Existing reservation exclusion and one-active-occurrence-per-obligation constraints remain authoritative.
- Preview is read-only. Publication locks actor/assignee User rows in stable order, then Department; receipt replay follows scope/current-role checks but precedes freshness rejection. The selected subset is re-solved and exact consent rechecked. No worker, solver, external messaging, provider integration or delivery ledger was added.
- Online link validation permits only HTTPS URLs with a hostname and no embedded username/password. It checks URL structure, not reachability or ownership. Faculty/section reservations remain mandatory; no room reservation is manufactured for an online occurrence.
- The feature migrations were applied non-destructively to the persistent local and isolated test databases. No seed timetable/recovery was published. Tests use project-authored synthetic future records; progress.md records actual results and remaining inherited tooling notes.

- Pre-push review added migration `20261114032000_recovery_online_link_check`: PostgreSQL CHECK permits UNKNOWN, so the online branch explicitly requires `meetingUrl IS NOT NULL`. A real-database regression test first reproduced the missing-link acceptance and now verifies rejection of null links, HTTP links and invalid room/mode combinations. Server URL validation was already present; the migration closes the independent database constraint gap.


## Feature 008 delivery and ledger decisions

- No dependency was added. Pure TypeScript ledger formulas, existing React Server Components/Server Actions, Zod, Prisma/PostgreSQL and the current test stack implement the feature.
- Additive migration `20261114040000_delivery_ledger` adds DeliveryRecord, scoped relations, current-record/unique-credit partial indexes, delivery-state/duration checks and explicit exclusive recovery-source relations on ResolutionPlan. Applied to persistent local and isolated test databases without resetting data or publishing seed schedules. Prisma datasource/schema diff remains empty.
- Delivery and corrections reuse User→Department locks, current-role checks, scheduling revisions, transactional audit and actor/payload-bound receipts. A reason is required for coordinator confirmations and corrections. Current record identity prevents concurrent corrections overwriting one another; the database separately prevents two current HELD credits for one obligation.
- `/delivery` is assigned-faculty/coordinator delivery; `/classes-owed` is coordinator/HoD/admin ledger. They use institution-local timestamps, URL semester filters, existing LPU styles and native form/history/table controls. No solver, messaging, worker, chart library or attendance system was added.
- `tests/support/delivery-fixture.ts` creates project-authored ended/future synthetic classes only in `slotwise_auth_test`. Controlled integration clocks cover future/ongoing/end boundaries and linked recovery. Cleanup explicitly dismantles fixture-only recovery references before removal; persistent demo records are untouched. Existing ESLint-support and pg-driver deprecation notes remain.

## Feature 012 timetable generation decisions

- The in-request TypeScript search uses a 400 ms cooperative deadline, 30,000 work steps and at most 1,500 local improvement checks. Input is bounded to 120 allocations, 300 required periods, 150 active slots, 30 active rooms and 600 rows per supporting resource set. The timer measures engine work including yields. Snapshot loading and draft import are separate database operations.
- Same seed and snapshot produce the same ordered choices. Wall-clock timeout or cancellation can interrupt at different work steps. Deterministic work-limit stops produce the same partial proposal for the same input and seed. Coverage may be complete even when quality improvement is interrupted. No outcome establishes global optimality or infeasibility.
- Bounded inputs fit the current request model. No worker, queue, dependency or migration was required. Review proposals are transient; importing one records its seed, policy, base revision, input digest, stop reason, elapsed time and quality components in the existing timetable audit.

## CSV parser (013)

`csv-parse` 7.0.3 parses uploads on the server. A strict UTF-8 decoder accepts a UTF-8 BOM and rejects invalid byte sequences and NUL. Uploads are limited to 128 KiB and 300 data records. The templates use ordered headers and synthetic examples. Formula neutralization is applied before export quoting. [CSV Parse documentation](https://csv.js.org/parse/)

## Feature 015 calendar feeds

- [ical-generator](https://github.com/sebbo2002/ical-generator) 11.1.3 serializes [RFC 5545](https://www.rfc-editor.org/info/rfc5545/) iCalendar on the server, using UTC instants from PostgreSQL with escaped and folded UTF-8 text. Tests parse responses with [ical.js](https://github.com/kewisch/ical.js) 2.2.1.
- Migration `20261115010000_calendar_feeds` adds the calendar subscription table, cancellation timestamps and a transition trigger. It backfills the timestamp on existing cancellations at migration time.
- Subscription URLs use the canonical `NEXTAUTH_URL` origin. Next.js incoming-request logging ignores the feed path. The `npm run dev` script suppresses Next.js diagnostic trace-file spans because those spans include raw request URLs even when incoming-request logging is filtered. Hosting/proxy/access logs and optional telemetry must redact the feed URL and issuance responses.

## Feature 017 expiry worker

The additive `20261115020000_emergency_cover` migration persists exact offers, winner state and indexed due deadlines. Run `npm run worker:emergency` alongside Next.js with the same `DATABASE_URL` and the project Node/TypeScript tooling. It polls every two seconds between passes and closes its database pool on shutdown. The `-- --once` flag processes currently due rounds and exits nonzero on a processing failure. An expired deadline closes acceptance immediately even if the worker is offline. The worker catches up after a restart. Hosted process supervision remains deployment configuration.
