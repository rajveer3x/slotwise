# SlotWise

A React and Next.js subject project for university timetables and faculty leave recovery. Features **000–007** provide the application foundation, credential authentication, role-scoped master data, dated timetables, transactional leave decisions, explainable draft leave resolutions, authorized cover responses, exact Saturday approvals and transactional recovery publication.

## Run locally

Prerequisites: Node.js **24.22.3** (see `.nvmrc`), npm and Docker Compose. Start Docker Desktop first. Use your normal Node manager; these commands assume nvm.

```sh
cd /Users/raj/projects/slotwise
nvm install
nvm use
npm ci
cp -n .env.example .env
```

Edit your ignored `.env`: set `AUTH_SECRET` to a unique random value of at least 32 characters (generate one with `openssl rand -base64 32`), choose a local `DEMO_SEED_PASSWORD` of at least 12 characters and at most 128 UTF-8 bytes, and keep `NEXTAUTH_URL=http://127.0.0.1:3000` for the commands below. Use HTTPS and the real canonical URL for a deployed environment. No secret should have a `NEXT_PUBLIC_` prefix.

```sh
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

Open [SlotWise](http://127.0.0.1:3000) and sign in. The explicit seed command preserves/creates these **synthetic** accounts in the Computing demo department:

| Role | Email |
| --- | --- |
| ADMIN | admin@demo.slotwise.test |
| COORDINATOR | coordinator@demo.slotwise.test |
| HOD | hod@demo.slotwise.test |
| FACULTY | faculty@demo.slotwise.test |
| STUDENT | student@demo.slotwise.test |

All use the password you supplied in `DEMO_SEED_PASSWORD` at their first creation. Seeding preserves existing accounts, roles, active status and passwords; changing the environment value does not rotate an existing password. Seeding refuses `NODE_ENV=production` and missing/short passwords. It never runs automatically at startup or build. The seed also creates faculty2–faculty6 and student2 in Computing, plus a smaller Design department. Additional addresses use `<identity>@demo-computing.slotwise.test` or `<identity>@demo-design.slotwise.test`. During implementation the local seed password was stored only in the ignored `.env`; that file contains the current local demo password. No shared credential is shipped in source.

PostgreSQL listens on `127.0.0.1:5433`; data persists in Docker's volume. Change both password placeholders in `.env` before the first database start if desired. URL-encode punctuation in `DATABASE_URL`. Changing the file does not change credentials inside an existing database volume. `docker compose stop db` stops the service; `docker compose down` preserves its volume. Do not add `--volumes` unless you intend to erase local data.

After changing the Prisma schema, run `npm run db:generate` and apply its migration. Restart `npm run dev` if an existing development process still reports an old client or missing model; browser refresh alone cannot replace a process cache.

`db:migrate` applies checked-in migrations without resetting data. Feature 001 adds Department, User, Role, a unique normalized email constraint and the department foreign key. Feature 002 adds semesters/holidays, faculty/availability, courses/qualifications, sections/memberships, rooms, teaching slots, allocations and mutation receipts. Composite foreign keys enforce department ownership. The seed creates two Computing sections, six faculty profiles, four courses, three rooms including a lab, a semester, memberships and their linked teaching configuration; Design contains a smaller isolation fixture. All capacities, workload limits and identities are project-authored demo examples. Reruns preserve existing records and credentials without resetting data.

## Test the feature manually

1. Sign in as faculty, inspect the faculty dashboard and reload. The account remains signed in. Sign out and visit `/dashboard`; authentication is required again.
2. Sign in as student. Visit `/admin` or `/admin/accounts` directly: access is denied. Navigation has no account-administration link.
3. In a separate browser profile, sign in as admin. Open **Account access** and revoke the faculty account. Reload the faculty dashboard in its original profile: it returns to login. Reactivate the account from admin and sign in again.
4. Submit an incorrect password five times for one email, then the correct one. Authentication still fails with the same generic message until that account's 15-minute window expires. Successful attempts also count toward the five-attempt window. A separate process-wide limit admits 100 attempts per minute. Restarting the server clears these local demo counters.
5. On a phone-sized viewport, open the Menu with the keyboard, follow Dashboard, and use Escape to close the drawer. Focus returns to Menu. The dashboard shows scoped schedule and leave summaries.

6. Sign in as coordinator and open **Master data** (`/admin`). Use **Rooms** to create `DEMO-NEW`, choose a type and positive capacity; reload to verify persistence. Repeat its code to see a server validation error with retained input. Search for the room, edit it, or expand Archive to read the dependency rules. Include archived records to restore it.
7. Open **Allocations**. Choose a semester, a section in that semester, a course and an explicitly qualified faculty member; enter weekly periods and required semester contact minutes separately. Computing seed allocations already cover all four courses for both sections, so create a new qualified course/section combination first to demonstrate a new allocation. No timetable is created by saving an allocation.
8. Open the same room in two browser profiles. Save an edit in the first, then submit the old form in the second: it reports stale data and retains input. **Refresh page** deliberately loads the current version. A coordinator cannot open Account access, change roles or provision accounts.

Identity links marked fixed (such as a section’s semester) cannot change after creation. Allocation faculty can be reassigned to another qualified teacher. Archive/restore qualifications and memberships as their eligibility changes. All removal uses reversible archival, including unreferenced records. Existing references remain intact, archived codes stay reserved and new relationships require unarchived parents. Only one semester is active per department. Holidays must remain within its inclusive local dates. Student membership is limited to one section per semester. Availability and slots use local weekday/minute intervals, allow adjacent intervals and reject overlapping intervals. Saturday configuration is exception planning only, not permission to schedule classes. Published-schedule guards now reject master-data edits that would invalidate future classes. Harmless edits advance schedule revisions and require a fresh timetable preview.

The automated tests additionally change roles in PostgreSQL while an existing session/form remains open, invoke unauthorized server mutations, reject other-department targets and exercise concurrent access writes. No browser role switcher or public registration exists.

## Manual timetable demo

Open **Timetable** (`/timetable`) as the seeded coordinator. Create a draft with a future effective date within the selected semester. Place allocations using day, start/end teaching slots and room; each theory period is a separate class, while a lab spans at least two adjacent slots in a laboratory. Complete the weekly counts shown under **incomplete allocations**. No timetable is generated automatically.

Try placing two classes with the same teacher, section or room at the same time. The move is rejected with resource/interval explanations; choose one of up to three valid alternatives. Desktop cards support drag moves; **Move class / Place class** provides keyboard and touch controls. Section/faculty/room filters and week controls are in the URL; phones show an agenda.

Choose **Preview publication**, review every dated Before/After change and recipient count, then **Publish N classes**. Publication skips holidays and reserves all resources atomically. Published classes have pending delivery, not earned teaching credit. Students see only classes for their current section membership. Create another draft to revise future dates: history and weekly obligation identities survive, and future resolved occurrences block template replacement.

The existing demo semester ends on 18 December 2026. After that date, configure a new semester and allocations in Master data; the seed does not reset dates or overwrite edits. Tests use independently authored future fixtures, not a seeded published timetable. Notification and audit records are stored at publication; their full viewers remain later features.

## Leave demo

First publish a future timetable as the coordinator (the seed creates teaching records, not dated classes). Sign in as `faculty@demo.slotwise.test`, open **Leave & impact**, choose inclusive dates containing that faculty's published classes and select **Preview impact**. Check the real class count and minutes, optionally enter a private reason, then submit. Submission and preview leave the timetable unchanged.

Sign out and sign in separately as `hod@demo.slotwise.test`. Open the pending request, review current impact and approve, or reject with a reason. Approval rechecks the current schedule, cancels future classes and releases reservations atomically while retaining obligations and pending delivery. As the student, open the relevant timetable week and enable **Include cancelled classes** to inspect cancellation without private leave reasons. Owners can withdraw pending requests. Zero-class leave is allowed; self-approval, past/overlapping dates and reopening closed requests are rejected. Recovery recommendations are in Resolutions; approved leave reversal remains outside the MVP.

## Checks

With Node 24 selected:

```sh
npm run typecheck
npm run lint
npm test
npm run db:validate
npm run db:check
npm run build
npm run check:client-bundle
```

Real-database integration and browser tests use a dedicated database named **slotwise_auth_test**. Set `TEST_DATABASE_URL` in `.env` with the same local connection credentials and this database name. Tests refuse any other database name. Create it once (if it already exists, skip the creation command), then apply migrations:

```sh
docker compose exec -T db createdb -U slotwise slotwise_auth_test
npm run db:test:migrate
npm run test:integration
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser tests use installed Google Chrome, start a production server on port 3100 with an ephemeral auth secret and the isolated database, then stop the server. Two workers bound native Argon2 memory and browser load. Alternatively install Chromium with `npx playwright install chromium` and omit `PLAYWRIGHT_CHANNEL=chrome`. The Chromium download was not verified locally.

Tests create their own uniquely scoped synthetic departments, users and teaching records and remove only those fixtures. Seed-rerun checks use a unique test namespace. They never reset a database. An interrupted process may leave test fixtures in the isolated database; test reruns use new IDs. Screenshots and failure traces go under ignored `test-results/`. Coverage includes auth flows; direct unauthorized queries/mutations; all master-data entities; scoped foreign keys; validation and duplicate feedback; archive/restore; seed reruns and production refusal; stale edits; concurrent writes, revocation and request retries; keyboard use; responsive reflow and automated WCAG scans. Timetable checks additionally cover actual PostgreSQL exclusion constraints, simultaneous publication/master-data edits, rollback, holiday exclusion, historical identity, drag and keyboard repair, and scoped student reads. Leave checks cover inclusive local dates, zero impact, changed schedules, competing decisions/publication, request retries, rollback, privacy, stale refresh and separate-user approval. CSS 200% scaling and axe checks do not establish exhaustive accessibility or screen-reader testing.

The single-process in-memory limiter is suitable only for this local demo; use a shared atomic limiter before a multi-instance deployment. JWT sessions expire after eight hours and carry identity only. Active status, role and department come from the database on protected reads and inside access-write transactions. Logout clears the current browser cookie; there is no durable session registry or global per-token revocation service. HTTP-only/SameSite=Lax auth cookies use Secure on HTTPS and permit local loopback HTTP.

Actual check results and the existing ESLint 9 support limitation are in [progress](context/progress.md). Auth integration details and official references are in [technology](context/tech.md). No deployment is provided.

## Draft resolution demo (005)

After publishing a future timetable, request leave as faculty and approve it as a different HoD. As `coordinator@demo.slotwise.test`, open **Resolutions**, select approved leave and inspect the first viable tier. Expand score/eligibility and rejected alternatives; select a candidate, inspect how later classes change, and save/reload your own draft. Rejections require reasons. Recompute after a stale schedule or draft warning. Faculty **Preview impact** also shows provisional greedy coverage estimates without naming other teachers.

The engine searches Substitute → Swap → Weekday → Online → Saturday. Makeups use the 14 days following the original date, bounded by semester end/current time; Saturday requires configured slots/availability and an exact HoD exception. Online is disabled by default and never allowed for labs. A search limit reports incomplete results; no feasible option leaves the class unresolved. Demo weights/limits live in `src/domain/resolution/engine.ts`; they are not university policy.

Drafts reserve nothing and never publish. Cover invitations/responses and Saturday approval are implemented in feature 006; recovery preview/publication is implemented below in feature 007. Confirmed-cover counts are currently zero because no delivery records exist yet. The persistent seed publishes no schedule or resolution; tests use project-authored 2099 fixtures in the isolated database. The current demo semester ends 2026-12-18.

## Cover and Saturday demo (006)

As coordinator, select a valid substitute on **Resolutions**, save the exact candidate and choose **Send cover invitation**. The response window defaults to 24 hours, accepts 1–168 whole hours as a demo setting, and is capped by class start. In another browser profile, sign in as the invited faculty and open **Cover & exceptions** (`/cover-requests`). Review the course, section, room, local interval and deadline; accept or decline. Another user cannot respond on their behalf. **Refresh responses** checks current server time and eligibility; an open stale page cannot extend the deadline. No background worker is required.

After decline or expiry, recompute as coordinator and choose the next faculty or tier. Response history is retained, and these exact declined/expired candidates cannot be restored by clearing coordinator rejections. Saved candidate edits cancel live consent; changing away and back still requires a new invitation. Accepting reserves nothing and never assigns teaching. Coordinator cancellation is also available in Cover & exceptions.

For Saturday, configure Saturday slots and original-faculty availability in Master data. Earlier feasible candidates must first be exhausted or explicitly rejected with reasons. Select/save the resulting Saturday candidate, enter a request reason and choose **Request HoD exception**. A different active departmental HoD reviews the exact candidate and attached earlier-tier explanations, then approves or rejects with a decision reason. A HoD cannot approve their own leave exception or their own request. Missing eligible approvers are reported explicitly. Candidate edits require new approval.

Invitation/response/expiry/cancellation and exception actions record transactional audit events and persisted in-app updates for involved staff. `/cover-requests` shows only your scoped records and your latest 30 recovery updates. Reads derive expiry immediately; a subsequent authorized write materializes expiry history. There is no external delivery, live push or general notification/acknowledgement center yet. Recovery publication is implemented in feature 007 below; delivered minutes remain feature 008. All demonstration records are synthetic; automated tests create isolated 2099 scenarios without publishing persistent seed schedules.

## Recovery preview and publication demo (007)

After saving exact candidates and obtaining any required cover acceptance or Saturday approval, stay on **Resolutions** and open **Preview and publish**. Check the saved classes to include. For online makeups enter a valid HTTPS meeting URL without embedded credentials. Choose **Preview selected changes**, inspect the labelled Before/After teacher, date/time and room, affected recipients and unresolved classes. Missing consent or links block publication. The final **Publish N changes** button appears after the comparison.

Publication revalidates the selected subset under the department lock. Every selected assignment, resource reservation, publication record, plan/item state, schedule revision, audit event, recipient notification and retry receipt commits together. One invalid selected class rolls back the batch. Swaps replace both sides atomically. All replacements keep their existing teaching obligations and pending delivery; original cancellations remain in history. Students see the new assignment after refreshing Timetable, including online links and an approved Saturday column/agenda day. Accepted/approved consent cards become Published and cannot be cancelled as an invitation.

To demonstrate stale recovery, leave a preview open in one browser, make a harmless room-name edit or publish another recovery in a separate coordinator/admin session, then try the old preview. It is rejected without a partial publication. **Recompute current resources**, review retained choices, **Save draft** and preview again. After subset publication, remaining classes are explicitly unresolved and their old items/previews are superseded. Full notification acknowledgement, audit viewers and delivery credit remain later features. All local tests use isolated synthetic 2099 fixtures; no persistent seed schedule is published automatically.

## React and Next.js concepts to explain

- **App Router/layouts:** `/login` is in `(auth)`; `(app)` supplies the protected shell for `/dashboard`, `/admin`, `/timetable`, `/leave`, `/resolutions` and `/cover-requests`. Route groups do not add URL segments. Loading and error boundaries give feedback while account data is resolved.
- **Server Components:** dashboard/admin/timetable/leave/resolution/cover pages fetch scoped data on the server. Only minimal account view models and rendered page content cross into the interactive shell; Prisma, hashes and secrets stay in `server-only` modules.
- **Client Components/hooks:** login and logout use React state for pending/error feedback; the menu uses refs and a native modal dialog. Account forms use React 19 `useActionState`.
- **Server Actions:** the account-access action validates form input, calls the authorization service, commits the database transaction and revalidates `/admin/accounts`. Master-data actions revalidate `/admin`, use Zod schemas, version checks and transactionally stored retry receipts. Stale state produces a refresh message.
- **Scheduling state:** pure TypeScript functions validate immutable placement snapshots. The editor uses controlled state, refs and `useTransition`; Server Actions revalidate and transact independently of the preview. Draft versions, schedule revisions and idempotency receipts solve different concurrency problems.
- **Leave state:** request status/version and schedule revision serve different purposes. A preview is a read-only snapshot; a HoD decision authorizes a transaction that re-queries dated occurrences. Controlled form state survives errors/refresh; the server independently checks identity, ownership and status.
- **Resolution state:** pure deterministic rules consume an immutable resource snapshot; controlled Client Components hold draft choices and use Server Actions to recompute the batch. Database drafts have separate edit versions and capture policy/revisions. Selection, acceptance, publication and delivery are distinct states.
- **Response state:** Server Components resolve scoped invitations and server deadlines; controlled Client Components retain reasons and retry keys with `useTransition`/refs. Server Actions independently authorize, revalidate exact candidates under the department lock and refresh routes after commit. Candidate fingerprints, partial unique indexes and retry receipts prevent different forms of duplicate consent.
- **Publication state:** a controlled subset and meeting-link form uses `useState`, `useRef` and `useTransition`. A read-only Server Action produces the comparison; a separate authorized action rebuilds it inside a database transaction and revalidates affected routes after commit. Preview fingerprints, edit versions, department revisions, resource exclusion and payload-bound receipts protect different boundaries.
- **Authentication and authorization:** Auth.js verifies credentials and signs/encrypts the session token using its CSRF flow. The server independently reloads current permissions. Hiding a navigation link is presentation, not a permission check.
- **Typed reusable UI:** Button, Input, PublicShell and AppShell use typed props and semantic design tokens. Server-rendered `children` can pass through a Client Component without making those page modules client-side code.

Development/build use Webpack because Turbopack's CSS worker failed on this host. System fonts avoid network font downloads. Agent-file generation is disabled to preserve `AGENTS.md`.

## Project context

- [Overview](context/overview.md)
- [Progress and build order](context/progress.md)
- [Technology](context/tech.md)
- [Architecture](context/architecture.md)
- [Domain rules](context/domain-rules.md)
- [UI and UX](context/ui-ux.md)
- [Feature specifications](context/feature-specs/README.md)
- [Authentication specification](context/feature-specs/001-auth-and-roles.md)
- [Agent instructions](AGENTS.md)

All identities and timetable illustrations are project-authored synthetic examples. No real university records or measured impact metrics are presented. Work stops after feature 007; later features require a separate request.
# slotwise
