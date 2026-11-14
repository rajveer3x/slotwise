# SlotWise architecture

## Shape

Build one Next.js application with PostgreSQL. The browser displays server-fetched data and sends user intent through authenticated server mutations. Services authorize, validate business rules, persist changes, and return structured outcomes. The core recommendation engine is deterministic TypeScript with no database or network calls inside its scoring functions.

```text
Server Component -> authorized query service -> Prisma -> PostgreSQL
Client form/grid -> Server Action -> authorization + Zod -> domain service
                                                        -> transaction
Pure engine <- immutable scheduling snapshot              -> audit + notifications
```

## Proposed layout

```text
src/
  app/
    (auth)/login/
    (app)/dashboard/
    (app)/admin/ (master data; /accounts for ADMIN account access)
    (app)/timetable/
    (app)/leave/
    (app)/resolutions/
    (app)/cover-requests/
    (app)/classes-owed/
    (app)/workload/
    (app)/reports/
    (app)/notifications/
    (app)/audit/
    api/auth/
  components/ui/
  features/<feature>/{components,actions,schemas}/
  server/{auth,db,queries,services}/
  domain/{scheduling,resolution,workload}/
  lib/
prisma/{schema.prisma,migrations,seed.ts}
tests/{unit,integration,e2e}/
context/
```

This is a starting convention, not a reason to create empty folders. Record justified changes here.

## Boundaries

The dashboard remains a Server Component. Its visual summary reuses `readTimetable` and `readLeaveWorkspace`; no new dashboard mutation endpoint exists. Faculty summaries additionally filter timetable occurrences to their own server-resolved faculty profile. Student occurrences inherit the timetable service's section-membership scope. The dashboard receives only safe leave list fields, excludes past start times from the upcoming agenda and presents actual counts rather than fabricated chart data. Global styling and the existing client shell own the LPU charcoal/lime/lavender presentation; domain services and transaction protocols remain unchanged by that refresh.

- Server Components own initial reads; pass minimal serializable view models to client controls.
- Client Components own drag state, filters, form interaction, pending indicators, and draft previews. They never authorize publication.
- Actions parse inputs and call services. Authorization must also protect reusable service entry points.
- Services implement workflows and transactions; pure domain functions compute clashes, candidate scores and metrics.
- Keep Prisma, password hashing and secrets in server-only modules. Never return password hashes, private leave reasons, or unrelated departmental records to a browser.
- Local state for temporary UI, URL search parameters for shareable filters, database for durable truth. Avoid mirroring the same server data in multiple global stores.

## Scheduling writes

Every mutating scheduling service uses a shared transaction protocol. Serialize writes within a department using a database lock or serializable transaction with bounded conflict retries; include resource-level database conflict protection for faculty, section and room intervals. Store active resource reservations for dated occurrences. Custom SQL migrations may be needed for PostgreSQL exclusion constraints; cover these with integration tests.

Use half-open timestamp intervals `[start, end)` so consecutive classes do not overlap. A lab reserves its entire consecutive interval. Drafts reserve nothing. On publishing: authorize, load expected revision, reject stale data, revalidate current resources/leave, apply all changes, replace reservations, write audit events and recipient notifications, increment the semester schedule revision under the department lock, and commit atomically. All scheduling mutation paths follow this protocol, including availability or room changes that affect a published schedule.

In the MVP, resources belong to one department and cross-department borrowing is disabled. Any future sharing must coordinate locks across all involved departments and preserve global resource conflict checks.

Use an idempotency key with actor/operation scope and a payload fingerprint for publication and other retryable compound mutations. After authorization, check an existing successful receipt before rejecting a stale revision, so a retry of a committed request can return its original result. Reuse with different input is rejected. Receipt creation and the mutation commit together; protect competing first submissions with uniqueness and transaction handling. Do not send external messages inside transactions. Core in-app notification records can be committed atomically; a later external delivery feature needs an outbox.

## Reads and freshness

Authorized server queries filter by department, faculty identity, or student section. Revalidate affected views after commits using APIs appropriate to the installed Next.js version. A preview carries the schedule revision used to compute it. A stale preview requires recomputation, not silent publication. Show an honest refresh state when another user has changed the schedule.

## Error contract

Return a consistent discriminated result such as `{ ok: true, data }` or `{ ok: false, code, message, fieldErrors? }`. Codes include UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, CONFLICT, STALE_VERSION, NOT_FOUND, and SEARCH_INCOMPLETE. Keep internal stack traces out of user messages. Do not optimistically display a scheduling write as confirmed before the server commits it.

## Tests

Unit-test interval overlap, qualification filters, tier selection, scoring, ledger and workload formulas. Integration-test actual PostgreSQL transactions, permissions, idempotency, rollback, and competing writes. Browser-test the main role-based leave-to-publication workflow and keyboard timetable editing. Freeze the clock in time-sensitive fixtures. Use synthetic data and reset only an explicitly identified test database.

## Implemented master-data boundary (002)

`features/master-data/config.ts` describes reusable fields and serializable view models; `schema.ts` owns per-entity Zod validation. `server/services/master-data.ts` owns scoped queries, actor/department locking, fixed identity links, dependency validation, version checks, reversible archival and retry receipts. `actions.ts` translates browser dates/times/checkboxes and revalidates `/admin` after commits. `/admin/accounts` retains feature 001's separate ADMIN service. Local-date strings and minute-of-day integers are configuration values; feature 003 adds dated schedule instants/reservations. MasterMutationReceipt is intentionally distinct from scheduling publication receipts.


## Implemented timetable boundary (003)

`domain/scheduling/timetable.ts` owns pure interval, slot, capacity, lab, qualification, availability, load, completeness, alternative and local-date calculations. `server/services/scheduling-store.ts` loads scoped scheduling snapshots, validates dated weeks and guards published schedules inside master-data transactions. `server/services/timetable.ts` owns authorized reads, draft creation/editing, preview and initial/prospective publication. `features/timetable/{schema,actions,components}` supplies the validated Server Action boundary and controlled editor; `/timetable` renders authorized filters and published views on the server.

All scheduling/master-data writes lock the actor with `FOR NO KEY UPDATE`, then the Department row with `FOR UPDATE`. Actor locks still serialize revocation/role changes while allowing notification recipient foreign-key references; using stronger actor locks deadlocked competing publications in a regression test. Accounts use the same compatible actor/target mode. Semester.scheduleRevision is the freshness token; master-data changes advance every semester in the department, and publication advances its semester. Cross-semester conflicts are checked against retained dated occurrences under the shared department lock and PostgreSQL reservation exclusion constraint.

A draft has an independent edit version and base schedule revision. Successful create/save/publish receipts are actor/payload-bound and read before stale rejection. Previews write no records; their fingerprint covers exact dated changes, retained statuses, recipients, draft version and revision. Publication rebuilds the plan under the lock, replaces reservations using half-open timestamptz ranges, records an append-only application audit and minimal in-app notifications, then commits a receipt. Database constraints prohibit resource overlap and two active occurrences for one obligation.

Stable series IDs persist across cloned weekly templates. An obligation is keyed by series plus institution-local Monday week date; a weekday move keeps its obligation and duration. Earlier/delivered occurrences are immutable, and a boundary-week unit already scheduled before the effective date is not duplicated later that week. Replaced future records become CANCELLED with linked replacements; removed units keep their obligations. Future records marked resolved fail closed. Feature 004 adds leave approval and absence guards below. Cover mutations now reuse this transaction protocol (006); delivery confirmation is implemented in 008 below.


## Implemented leave boundary (004)

`domain/leave/rules.ts` and `features/leave/schema.ts` validate full-day local dates and operation shapes. `server/services/leave.ts` owns authorized list/detail/impact reads, submission, withdrawal and HoD decisions. `/leave` is a Server Component with a minimal scoped view model; controlled Client Components use `useTransition`, retained input, retry keys and explicit status refresh. `features/leave/actions.ts` resolves signed identity and revalidates leave, timetable and dashboard views after commits. Preview queries use repeatable-read snapshots and never create receipts, audit records, requests or reservations.

Mutations lock the actor and request owner user rows in sorted order before the department lock, reload permissions/eligibility, check actor/payload-bound scheduling receipts before stale status/version rejection, and commit exactly one transition. PostgreSQL additionally excludes inclusive overlapping SUBMITTED/APPROVED date ranges for a faculty member, even across semesters. Private request/rejection reasons are selected only for the owner or departmental HoD; safe list/detail reads for coordinators/admins and general audits omit them. Students have no leave endpoint access and timetable DTOs remain explicit safe projections.

Approval re-queries all assigned active, future, pending-delivery occurrences in the inclusive local range, including overlapping semesters. It cancels those occurrences, links them to the leave request, releases their reservations, retains obligations and delivery status, advances every affected semester plus the request semester, and writes audit/receipt records atomically. A zero-class approval still advances the request semester. Initial timetable publication rejects approved absences; prospective template publication fails closed when its affected horizon includes leave-linked cancellations, preserving unresolved teaching units for the later recovery workflow. Master-data guards retain future pending/approved leave calendar bounds. Approved leave reversal remains outside MVP.

Template publication also checks the obligation identities of proposed replacements. A midweek effective date cannot bypass a leave cancellation earlier in that same week by moving its class to a later weekday. Preview freshness compares revisions monotonically: a server-computed preview newer than the currently rendered page is current, while a page refresh exposing a later revision marks an older preview stale.


## Implemented resolution boundary (005)

`domain/resolution/engine.ts` consumes an immutable dated scheduling snapshot, explicit current time, versioned demo policy and selected/rejected decisions. It has no database/network calls or implicit clock reads. It checks hard constraints before ranking, validates both equal-duration same-section swap destinations, and treats selected assignments as temporary batch reservations. Earlier choices cannot be swapped away by later items. Re-solving starts in stable original date/time/ID order; greedy results do not claim global optimality. The bounded search distinguishes incomplete search from no feasible candidate in the configured window.

`server/services/resolutions.ts` builds department-scoped repeatable-read snapshots, computes boards/anonymous coverage counts, and saves DRAFT-only plans/items under the existing actor-then-department lock protocol. Plans belong to the individual coordinator/admin and approved leave. Saves recheck scope, schedule/policy token, independent draft version and the complete selected batch; policy/revision snapshots, candidate fingerprints, explanations, staff rejection reasons, audit and an actor/payload-bound receipt commit together. Draft saves do not increment the schedule revision or touch occurrences, reservations, delivery or notifications. Revision tokens cover every departmental semester so cross-semester resource changes invalidate a draft. New plan/item foreign keys prohibit identity updates and preserve referenced history.

`/resolutions` owns the authorized Server Component read; `features/resolutions` owns controlled master/detail selection, native disclosures, pending/error/success/stale feedback and validated Server Actions. Server recomputation preserves choices and surfaces invalidated selections; explicit review is needed before saving. Leave impact preview adds only aggregate provisional estimates from a hypothetical approved absence, with greedy temporary choices to avoid double-counting a free interval. No substitute identity/private leave data is returned to the requesting faculty. Cover acceptance and Saturday decisions are implemented in 006 below; recovery publication is implemented in 007 below.


## Implemented cover/exception boundary (006)

`domain/covers/consent.ts` defines canonical candidate checks and deadline calculations. `server/services/covers.ts` owns authenticated invitations, invited-faculty responses, coordinator cancellation, exact Saturday requests/HoD decisions and scoped workspace reads. Mutations reload the locked actor, serialize on Department, authorize the entity before receipt replay, re-solve the saved entire resolution batch and atomically commit consent, audit, in-app notifications and actor/payload-bound receipts. Responses and approvals never create reservations, change occurrences or advance schedule revisions. Acceptance checks server time after waiting for locks and again at the response write boundary; default expiry is 24 hours capped by class start, with coordinator-configured 1–168 whole hours as a demo setting.

`consent-store.ts` supplies history, server-derived expiry, locked expiry materialization, exact-consent guards and saved-choice invalidation. Draft saves now upsert stable ResolutionItem IDs and retain historical items; changing/clearing a saved candidate cancels its pending/accepted response or pending/approved exception without deleting timestamps or audit history. Server-owned declined/expired/HoD-rejected candidates are merged into engine exclusions independently of editable client rejections. These terminal response identities enter the board freshness token. Partial unique PostgreSQL indexes additionally forbid two accepted covers for one teaching obligation and multiple live requests per plan item.

Reads use repeatable-read snapshots and derive expiry from server time without side effects or a worker; a subsequent authorized mutation persists expired statuses and notification/audit history. DTOs expose only card-specific labels and safe fields. Faculty see their invitations; managers see their own sent requests; departmental HoDs see Saturday exceptions and cannot approve their own request or own leave. Admin has no HoD authority. `/cover-requests` reuses AppShell and inherited loading/error boundaries. Controlled feature components use shared Button/Input, retained input/retry UUIDs, `useTransition`, refresh, native disclosures and paged explanation groups. Recipient-only recovery updates are a narrow view of existing Notification records, not feature 010's general notification/acknowledgement center.

Feature 007 must rebuild/revalidate scheduling resources and call `assertExactConsent` for the exact saved candidate under the shared transaction lock. That helper establishes consent only; it does not grant general publication permission or reserve resources. Accepted responses remain usable after their response deadline, while class-start/current-eligibility checks still apply at publication. Changing away and back requires fresh consent because invalidation is durable.


## Implemented recovery publication boundary (007)

`features/publications/{schema,actions,components}` extends `/resolutions` with explicit saved-subset selection, optional HTTPS meeting links, safe Before/After comparisons, affected recipients, unresolved classes and consent blockers. Its final standard Publish button follows the review. Preview uses a repeatable-read snapshot and writes no records, including plan state or receipts. Readiness is derived from the validated preview, rather than persisted by a read.

`server/services/publications.ts` authorizes the current owning coordinator/admin, checks scope before receipt replay, and rebuilds the exact selected subset and consent under the shared department lock. Proposed assignee User rows and actor are locked in sorted order before Department to serialize against account revocation as well as scheduling writes. Assignees are discovered from the saved server draft and verified again after full revalidation. Accepted cover/Saturday identities use `assertExactConsent`; online requires a validated credential-free HTTPS URL. The final class-start guard runs again before receipt creation.

A SchedulePublication holds safe before/after details and a fingerprint. Linked replacement occurrences (including substitutions) preserve cancelled originals, pending delivery, existing obligations and required duration; swaps release all old reservations before creating both new sides. Every selected item, publication, occurrence, reservation, audit, recipient Notification, affected-semester revision and actor/payload-bound receipt commits together. Committed consent remains historical and cannot be cancelled as an invitation. Other departmental previews use old revision snapshots and unpublished items become SUPERSEDED; recompute/save returns remaining items to DRAFT without altering committed items. Published template records remain protected from overwrite.

`scheduling-store.ts` now owns the reusable resolution snapshot and actual occurrence-to-assignment projection. Master-data guards and prospective template conflict checks use actual assigned faculty, room/mode and approved Saturday tier, rather than assuming the weekly allocation teacher for recovered classes. Online room relations are nullable; in-person occurrences still require a room through a database check. Recovery uniqueness uses stable obligations and resource exclusion; a template entry/date is not a recovery identity because different weeks may recover on the same date at nonoverlapping times. `/timetable` projects safe replacement labels/meeting links and adds Saturday when present; leave details count actual unresolved units separately from historical cancellations.


## Implemented delivery and ledger boundary (008)

`domain/delivery/ledger.ts` computes allocation requirements, unique delivered credit, future planned coverage, outstanding and overdue minutes from stable obligations and authoritative current DeliveryRecords. It accepts an explicit clock. Due time is the earliest scheduled end in an obligation's history. Requirements without materialized units remain outstanding but have no fabricated due time. `server/services/delivery.ts` owns repeatable-read department/semester-scoped ledger queries and assigned-faculty delivery reads. Faculty cannot read the departmental ledger; coordinator/HoD/admin ledger reads send only ledger DTOs, while delivery reads return only permitted classes and safe history.

Delivery mutations lock/reload User then Department, reauthorize scope before receipt replay, check the class end after locking, and require the exact current record ID for corrections. Only assigned active faculty (including HoD profiles) or departmental coordinators can confirm; only coordinators can correct. Coordinator confirmations and corrections require reasons. Full-duration records, occurrence delivery status, past reservation release for NOT_HELD, semester revision, audit and actor/payload-bound receipts commit together. Corrections retire the previous current record, retaining its timestamp/actor/minutes. HELD never resurrects cancelled reservations; a published replacement blocks correction of its predecessor. Partial delivery/split recovery and reviewed schedule reversal remain outside this feature.

`DeliveryRecord` has scoped foreign keys, a per-occurrence current-record unique index and a per-obligation current-HELD unique index. A database trigger validates the occurrence/obligation/duration relationship independently of the service. Historical NOT_HELD records and a later HELD replacement can coexist without double credit. Reads calculate totals; clients maintain no earned-minute counters.

ResolutionPlan now has exactly one source: approved leave or a not-held source occurrence. The existing `leaveId` action/query field is retained as a compatible recovery-source key; persisted source relations remain explicit. A missed leaf occurrence, including an already published recovery, re-enters the existing obligation-based engine and atomic publication workflow without creating a leave request or requirement. Leave provenance remains in the obligation's retained original/replacement history. Leave details count an affected obligation as unresolved when it has neither an active occurrence nor confirmed delivery, even after a replacement was published and marked not held. Saturday consent excludes both the assigned teacher and original leave owners from approving their own recovery. Monthly substitute ranking now uses unique current HELD records for published tier-1 assignments, not accepted invitations.

`/delivery` and `/classes-owed` reuse the protected shell, Button/Input, inherited route loading/error boundaries and controlled forms with retained retry identity, required reasons, pending/error/success/stale feedback and route revalidation. Ledger tables use a labelled keyboard-scrollable region on narrow screens. Delivery actions are shown first. No notification center, reporting dashboard, external service or new dependency was added.


## Implemented workload and report boundary (009)

`/workload` and `/reports` use server-only reads with a repeatable-read PostgreSQL snapshot. Both reload the current actor and scope every query by department. The faculty workload query also scopes by the actor’s faculty profile. Narrow Prisma projections supply pure workload and recovery functions without private leave content. Both React tables and CSS bar charts render the same metric results. GET forms expose shareable institution-local dates. Publication, leave, delivery and relevant master-data actions revalidate the dashboards after successful operations.


## Implemented notifications boundary (010)

`server/services/notifications.ts` scopes inbox and detail reads by authenticated recipient and department. Recovery publications snapshot the recipient's affected obligation IDs with each notification. The inbox projects safe fields from the saved before/after snapshot and resolves current timetable links by teaching obligation. Earlier recovery notifications are linked to their publication by a migration and use current section/faculty scope for detailed history because the original per-class audience was not stored.

Notification mutations lock and reload the actor before touching the scoped record. The acknowledgement primary key and foreign key to the original notification enforce one acknowledgement per recipient and recovery publication. The notification's read state and acknowledgement commit in one transaction. Department managers see aggregate counts from the original recipient rows. The inbox refreshes on navigation, explicit refresh and local mutations.


## Implemented audit boundary (011)

`/audit` uses an authorized Server Component with bookmarkable GET filters and an optional detail ID. `server/services/audit.ts` reloads the current actor and checks the department for list and detail reads. It queries each page in descending time and ID order from a repeatable-read PostgreSQL snapshot, then projects detail JSON through an allowlist specific to each action. Actor labels use current names in the same department, falling back to a historical account label. No audit edit or delete operation is exposed by the application.

Timetable draft creation and saves write safe before/after data in the existing transaction alongside the retry receipt. Template and recovery publication events record committed occurrence IDs. Histories created before these additions retain their original contents and coverage.

## Implemented timetable generation (012)

`domain/scheduling/generation.ts` shares the weekly placement validator with the editor. It uses seeded candidate ordering, difficulty-ranked greedy placement, bounded backtracking and local quality improvements. It returns coverage and stop reason separately. The generator holds the latest published weekly placements and their stable series IDs fixed. The editor can still move those units under the existing publication rules.

The manager-only Timetable panel uses a cancellable POST to `/api/timetable/generate`. The service closes a scoped repeatable-read transaction before computing. The Route Handler passes the abort signal and the engine yields periodically. An in-memory proposal carries an actor-bound, server-signed snapshot and revision. Import is a separate authorized Server Action. It rechecks the scoped snapshot and revision under the actor and department locks, validates placements and commits the draft, generation metadata in audit and a retry receipt together. The editor runs its existing completeness and dated-publication checks before creating any occurrences or reservations.

## CSV import and export (013)

`/csv` is a protected manager workspace reached from Master data and Timetable. A Client Component submits the selected file to a Server Action for read-only preview and again for commit. The preview signs the exact file, operation parameters, actor, department and resolved snapshot. Commit reloads authorization, locks affected user rows in stable order and then locks Department. It revalidates rows and the revision and commits the batch, audit and a retry receipt together. Master imports advance the department's semester revisions. Timetable imports create a new draft for the existing editor and reuse published series IDs for identical or same-duration moved units where possible.

`GET /api/csv` returns authenticated attachment responses for templates and active published occurrences for one scoped semester. It projects course/section/room labels, faculty display name, local interval and delivery status. CSV formatting quotes each field and neutralizes formula-leading values.

## Advisory makeup polls (014)

The Resolutions board opens a poll from two or three current weekday options for one unresolved class. The server rebuilds the saved board and validates each offered candidate as a potential standalone publication subset. The poll stores exact candidate IDs and frozen display details. Replacing options creates a new poll under the department lock, with the prior poll identity checked to prevent concurrent overwrites. PostgreSQL also allows only one stored OPEN poll per obligation, one vote row per poll, and requires that a vote references an option of that same poll.

The poll workspace is a scoped Server Component. Managers see department results and representatives see only polls for their current designated sections. Server Actions use locked actor and department checks, current section membership, exclusive server deadlines and payload-bound receipts. Reads derive closure at expiry or resolution of the source class. The review link carries the exact preference to the existing resolution compute/save/preview/publish sequence. Core publication has no poll dependency.
