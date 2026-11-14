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

Stable series IDs persist across cloned weekly templates. An obligation is keyed by series plus institution-local Monday week date; a weekday move keeps its obligation and duration. Earlier/delivered occurrences are immutable, and a boundary-week unit already scheduled before the effective date is not duplicated later that week. Replaced future records become CANCELLED with linked replacements; removed units keep their obligations. Future records marked resolved fail closed. Feature 004 adds leave approval and absence guards below. Cover mutations and delivery confirmation remain later features and must reuse this transaction protocol.


## Implemented leave boundary (004)

`domain/leave/rules.ts` and `features/leave/schema.ts` validate full-day local dates and operation shapes. `server/services/leave.ts` owns authorized list/detail/impact reads, submission, withdrawal and HoD decisions. `/leave` is a Server Component with a minimal scoped view model; controlled Client Components use `useTransition`, retained input, retry keys and explicit status refresh. `features/leave/actions.ts` resolves signed identity and revalidates leave, timetable and dashboard views after commits. Preview queries use repeatable-read snapshots and never create receipts, audit records, requests or reservations.

Mutations lock the actor and request owner user rows in sorted order before the department lock, reload permissions/eligibility, check actor/payload-bound scheduling receipts before stale status/version rejection, and commit exactly one transition. PostgreSQL additionally excludes inclusive overlapping SUBMITTED/APPROVED date ranges for a faculty member, even across semesters. Private request/rejection reasons are selected only for the owner or departmental HoD; safe list/detail reads for coordinators/admins and general audits omit them. Students have no leave endpoint access and timetable DTOs remain explicit safe projections.

Approval re-queries all assigned active, future, pending-delivery occurrences in the inclusive local range, including overlapping semesters. It cancels those occurrences, links them to the leave request, releases their reservations, retains obligations and delivery status, advances every affected semester plus the request semester, and writes audit/receipt records atomically. A zero-class approval still advances the request semester. Initial timetable publication rejects approved absences; prospective template publication fails closed when its affected horizon includes leave-linked cancellations, preserving unresolved teaching units for the later recovery workflow. Master-data guards retain future pending/approved leave calendar bounds. Approved leave reversal remains outside MVP.

Template publication also checks the obligation identities of proposed replacements. A midweek effective date cannot bypass a leave cancellation earlier in that same week by moving its class to a later weekday. Preview freshness compares revisions monotonically: a server-computed preview newer than the currently rendered page is current, while a page refresh exposing a later revision marks an older preview stale.
