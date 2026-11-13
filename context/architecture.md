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

Use half-open timestamp intervals `[start, end)` so consecutive classes do not overlap. A lab reserves its entire consecutive interval. Drafts reserve nothing. On publishing: authorize, load expected revision, reject stale data, revalidate current resources/leave, apply all changes, replace reservations, write audit events and recipient notifications, increment the department schedule revision, and commit atomically. All scheduling mutation paths follow this protocol, including availability or room changes that affect a published schedule.

In the MVP, resources belong to one department and cross-department borrowing is disabled. Any future sharing must coordinate locks across all involved departments and preserve global resource conflict checks.

Use an idempotency key with actor/operation scope and a payload fingerprint for publication and other retryable compound mutations. After authorization, check an existing successful receipt before rejecting a stale revision, so a retry of a committed request can return its original result. Reuse with different input is rejected. Receipt creation and the mutation commit together; protect competing first submissions with uniqueness and transaction handling. Do not send external messages inside transactions. Core in-app notification records can be committed atomically; a later external delivery feature needs an outbox.

## Reads and freshness

Authorized server queries filter by department, faculty identity, or student section. Revalidate affected views after commits using APIs appropriate to the installed Next.js version. A preview carries the schedule revision used to compute it. A stale preview requires recomputation, not silent publication. Show an honest refresh state when another user has changed the schedule.

## Error contract

Return a consistent discriminated result such as `{ ok: true, data }` or `{ ok: false, code, message, fieldErrors? }`. Codes include UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, CONFLICT, STALE_VERSION, NOT_FOUND, and SEARCH_INCOMPLETE. Keep internal stack traces out of user messages. Do not optimistically display a scheduling write as confirmed before the server commits it.

## Tests

Unit-test interval overlap, qualification filters, tier selection, scoring, ledger and workload formulas. Integration-test actual PostgreSQL transactions, permissions, idempotency, rollback, and competing writes. Browser-test the main role-based leave-to-publication workflow and keyboard timetable editing. Freeze the clock in time-sensitive fixtures. Use synthetic data and reset only an explicitly identified test database.

## Implemented master-data boundary (002)

`features/master-data/config.ts` describes reusable fields and serializable view models; `schema.ts` owns per-entity Zod validation. `server/services/master-data.ts` owns scoped queries, actor/department locking, fixed identity links, dependency validation, version checks, reversible archival and retry receipts. `actions.ts` translates browser dates/times/checkboxes and revalidates `/admin` after commits. `/admin/accounts` retains feature 001's separate ADMIN service. Local-date strings and minute-of-day integers are configuration values; dated schedule instants/reservations remain feature 003 and publication work. MasterMutationReceipt is intentionally distinct from later scheduling publication receipts.
