# SlotWise project walkthrough

## The 30-second introduction

> SlotWise is a React and Next.js project for managing a university department’s timetable and recovering classes affected by faculty leave. A coordinator publishes a valid timetable, faculty preview and request leave, and the HoD reviews it. The app explains feasible substitutes or makeup classes. After the necessary response or approval, the coordinator reviews and publishes the change. Students see the revised timetable, and the system credits the teaching minutes when someone records that the class was held.

There are **18 numbered specs**. **000** is the foundation. **001–011** implement the core application and its verification. **012–017** add six extensions. This is a local academic demo using synthetic LPU-branded data and configurable demo policies. [Feature index](context/feature-specs/README.md)

## What each role can do

| Role | What to show in the demo |
| --- | --- |
| Administrator | Maintain departmental master data. View account roles and activate or revoke existing accounts. Manage timetable drafts and normal recovery, and view reports and audit history. Demo users and roles are provisioned by the seed. |
| Timetable coordinator | Maintain master data, edit or generate a weekly timetable, resolve conflicts, publish timetable and recovery changes, run what-if scenarios, run makeup polls, handle emergency rounds, and review delivery and reports. |
| Head of Department (HoD) | Approve or reject departmental leave, including checking the latest impact, and decide exact Saturday exceptions. View workload, classes owed, reports and audit. An HoD with a teaching profile can use faculty workflows, with another authorized HoD required for their own leave approval. |
| Faculty | Preview and request leave, withdraw a pending request, accept or decline personal cover offers, confirm assigned class delivery, and view personal workload and calendar feeds. |
| Student | Read the published timetable for their section memberships, view and acknowledge schedule changes, and subscribe to section calendars. A designated section representative can cast or replace one advisory makeup preference during a poll. |

The server checks the current account, role, department and, where relevant, membership, ownership or assignment. The sidebar is a navigation aid. [Navigation](src/components/app-shell.tsx) · [Session checks](src/server/auth/session.ts)

## Every feature

| Spec | What it does | Where to see it |
| --- | --- | --- |
| 000 Foundation | Sets up the App Router, landing page, shared UI, configuration, database tooling and test infrastructure. | `/`, `/login` |
| 001 Authentication and roles | Credential sign-in, logout, role-aware navigation, login throttling, current-account checks and account revocation. | `/login`, `/dashboard`, `/admin/accounts` |
| 002 Master data | Manage semesters and holidays, faculty and availability, courses and qualifications, sections and memberships, rooms, slots and allocations. Seed synthetic profiles and linked records. | `/admin` |
| 003 Timetable and conflict repair | Edit weekly drafts with drag or keyboard controls, see clashes and repair options, then preview and publish actual dated classes. Skip holidays and preserve past history. | `/timetable` |
| 004 Leave and impact | Show affected dated classes before submission. The HoD approves or rejects. Approval cancels affected future assignments and frees their reservations while retaining the teaching obligations. | `/leave` |
| 005 Recovery recommendations | Explain eligible options, rejected candidates and blockers. Rank suggestions using a five-tier rule engine and save a departmental recovery draft. | `/resolutions` |
| 006 Consent and exceptions | Invite an exact substitute, handle accept/decline/expiry, and ask the HoD to approve an exact Saturday assignment. | `/cover-requests`, `/resolutions` |
| 007 Preview and publish | Compare the original and proposed schedule, publish a reviewed subset atomically, and retain replacements, reservations, audit and inbox history. | Before / After in `/resolutions` |
| 008 Delivery and ledger | Mark an ended class held or not held, allow reasoned coordinator corrections, and count delivered minutes once per obligation. Not-held classes can need further recovery. | `/delivery`, `/classes-owed` |
| 009 Workload and reports | Show weekly planned and delivered minutes, utilization against faculty targets, and leave outcomes such as weekday, Saturday, unresolved and delivered recovery. | `/workload`, `/reports` |
| 010 Notifications | Show recipient-specific change details and links to current assignments. Track read state and explicit acknowledgement separately. Managers can view recovery acknowledgement totals. | `/notifications` |
| 011 Audit and demo | Filter scoped scheduling history by actor, action, entity or dates and examine safe before/after details. A browser test exercises the core workflow across separate accounts. | `/audit` |
| 012 Automatic generation | Propose a weekly timetable, keeping placements from the latest published template when one exists. Review partial results and blockers, then import a proposal into a draft for validation and publication. | Generate in `/timetable` |
| 013 CSV | Download templates for faculty, courses, rooms or weekly draft entries, preview row errors, commit an atomic import and export the published timetable. Faculty rows link to existing accounts. | `/csv`, linked from master data or timetable |
| 014 Makeup voting | Offer two or three weekday makeup choices to the designated representative. Managers can carry the exact preference into normal recovery review. | `/makeup-polls`, `/resolutions` |
| 015 Calendar feeds | Create, rotate or revoke private iCalendar subscriptions for teaching profiles or student sections. Calendars follow published moves and cancellations. Refresh timing depends on the calendar client. | `/calendar-feeds`, `/api/calendar/[key]` |
| 016 What-if simulation | Model one room closure or faculty absence for up to 31 days and 30 affected upcoming classes, see proposed recovery and projected workload, and check if the baseline went stale. The database transaction is read-only. | `/simulation` |
| 017 Emergency cover | Send simultaneous same-day offers to eligible substitutes. One valid acceptance wins. If nobody accepts by the deadline, the worker records a later-tier fallback for coordinator review. | `/resolutions`, `/cover-requests`, `/notifications` |

## Follow one class through the system

Imagine a 60-minute Database Systems class for Section A on Monday at 10:00.

| Stage | What happens to the schedule | Delivered minutes for this obligation |
| --- | --- | --- |
| Coordinator publishes the weekly pattern | The app creates real dated occurrences for the semester and reserves the teacher, section and room for each active occurrence. | 0 |
| Faculty previews and submits leave | The preview lists the affected occurrence. Submission creates a request for review. | 0 |
| HoD approves leave | The original occurrence is cancelled, its reservations are released, and its teaching obligation remains due. | 0 |
| Coordinator drafts and invites a substitute | The draft and response record the exact candidate. In this example, the substitute accepts the Monday 10:00 assignment. | 0 |
| Coordinator publishes after Before / After review | A replacement occurrence and new reservations become active. The student sees the replacement and can acknowledge the update. | 0 |
| Assigned substitute records Held after the class | The current delivery record credits the same obligation once. Classes owed and workload reflect the credit. | 60 |

### Four records interviewers will ask about

- **Course allocation** defines which teacher teaches a course to a section in a semester and how many weekly periods it needs.
- **Timetable entry** is the recurring weekly placement, such as Monday at 10:00 in room R1.
- **Class occurrence** is a dated assignment of teacher, section, time and room or online mode. It has a scheduling state and a separate delivery state.
- **Teaching obligation** is the stable identity of the teaching unit owed to that section. The cancelled Monday occurrence and its replacement refer to the same obligation. The ledger uses that identity to deduplicate credit, and calendar events use it for stable event IDs. [Data model](prisma/schema.prisma)

### The five-tier recovery ladder

1. **Substitute.** Keep the original class interval and find qualified available faculty. Rank eligible teachers by assigned-to-target load, then confirmed cover count for the month and stable ID. The specific invite must be accepted.
2. **Swap.** Exchange two compatible times in the same section. Check both sides, including teacher availability, duration, delivery type, room and workload.
3. **Weekday makeup.** Find an eligible weekday slot for the original teacher and section. The ranking favors useful timetable gaps, adjacency and earlier recovery, and penalizes crowded days and the last period.
4. **Online makeup.** Search weekday time without requiring a physical room. Department policy must allow it, the class must be eligible theory, and publishing requires a valid meeting URL.
5. **Saturday makeup.** Search for an eligible Saturday placement, then require an HoD decision for that exact candidate.

The search checks qualification, availability, approved leave, overlapping resources, workload limits and room suitability before ranking. The normal board shows up to three ranked alternatives from the first feasible tier and explains why earlier tiers could fail. A makeup search runs within 14 calendar days after the original date, bounded by semester and current time. A coordinator can reject choices with reasons and recompute. If the bounded search finds no feasible choice, the obligation remains unresolved. [Recovery engine](src/domain/resolution/engine.ts) · [Policy and scoring](context/domain-rules.md#resolution-ladder)

### Two algorithms to distinguish

**Timetable generation** places a semester’s recurring weekly requirements. It builds valid room and slot candidates, starts with the hardest allocations, tries a greedy pass, then bounded backtracking when it still has work to do. A final local improvement pass favors spreading classes and keeping lab space available. Placements from the latest published weekly template are fixed. The generator can return a partial proposal if time or work limits are reached. [Generation algorithm](src/domain/scheduling/generation.ts) · [Generation service](src/server/services/timetable-generation.ts)

**Class recovery** repairs an individual dated obligation or a batch of obligations after disruption. It applies the ordered policy ladder above, checks candidate interactions and explains results. Simulation reuses the same recovery logic with an in-memory disruption overlay. Both scheduling algorithms run as TypeScript code. The proposal and recovery searches use heuristics and their results can be incomplete. [Simulation algorithm](src/domain/scheduling/simulation.ts)

## How the React and Next.js code works

The local stack is React 19, Next.js 16 App Router, TypeScript 5, Tailwind CSS 4, Zod 4, Prisma 7 and PostgreSQL. NextAuth manages credential sessions and Argon2id hashes passwords. Vitest checks domain and UI logic, Node’s test runner checks real PostgreSQL workflows, and Playwright drives the browser. [Manifest](package.json)

1. **Routing and rendering.** Next.js turns files such as `src/app/(app)/timetable/page.tsx` into URLs. Parentheses form route groups, so the URL is `/timetable`. The protected layout checks the session and renders the shared shell. Server Components fetch scoped data and pass view models to interactive controls.
2. **React interactions.** Client Components hold temporary state for form inputs, selected candidates, drag interactions and previews. Hooks such as `useState` and `useTransition` drive pending feedback and update the UI. Shared controls and the global stylesheet provide the charcoal, lime and lavender LPU interface.
3. **Server Actions.** When a user submits or publishes, a `"use server"` function calls a server-only service. Zod validates input at the boundaries. After a commit, `revalidatePath` refreshes affected routes so they can read committed data.
4. **Server services and domain rules.** Services resolve the current actor, query Prisma, run business rules and coordinate transactions. Domain functions compute conflicts, recommendations, rankings and report totals from supplied data. They can be tested without a browser or database.
5. **Route handlers.** `app/api/**/route.ts` handles HTTP endpoints for NextAuth, calendar subscriptions, CSV downloads and timetable generation. Generation uses a POST request with cancellation support, while web forms typically use Server Actions.
6. **Persistence.** PostgreSQL owns durable drafts, assignments, reservations, reviews, receipts and audit history. Prisma is the typed database client. Checked-in SQL migrations add constraints and indexes alongside the models.

For a concrete code walkthrough, open these in order and find `publicationAction`, then `changePublication`. Trace the result back to the review component and then to the student’s timetable. [Recovery page](src/app/%28app%29/resolutions/page.tsx) · [Recovery action](src/features/publications/actions.ts) · [Publication service](src/server/services/publications.ts) · [Timetable service](src/server/services/timetable.ts)

### Why validation happens again at publish time

Alice and Ravi can open the same Before / After preview. Between those reads, someone may reserve the room, revoke the substitute’s account or change the schedule. Publication rechecks the current actor, revision and preview fingerprint, exact consent and current constraints inside a transaction. Department locking serializes competing scheduling writes, and a PostgreSQL exclusion constraint rejects overlapping teacher, section or room reservations. A mutation receipt makes a retry of the same request safe. If a step fails, the transactional changes roll back together. [Publication service](src/server/services/publications.ts) · [Reservation constraint](prisma/migrations/20261113010000_timetable/migration.sql)

### Why emergency cover has a worker

A round stores its deadline, offers and outcome in PostgreSQL. The response transaction checks current eligibility and time and records one winner even if two faculty accept concurrently. The standard expiry window is five minutes or class start, whichever comes first. Once time runs out, acceptance closes on the server. A separate worker polls for due rounds, records one fallback snapshot and notifies the coordinator. A stopped worker delays that proposal until it resumes. The winning offer or fallback still goes through coordinator publication. [Emergency service](src/server/services/emergency-cover.ts) · [Worker](scripts/emergency-worker.ts)

## How to demo it

1. Set up Node 24, an ignored local `.env`, Docker PostgreSQL and synthetic users using the README. Seeding supplies linked master data and accounts. Start with a valid **published** future timetable for the manual demo. The seeded Autumn 2026 term ends on 18 December 2026. After that, configure a future semester and its allocations or use the independent browser fixture. [Setup](README.md#run-locally) · [Manual timetable demo](README.md#manual-timetable-demo)
2. Open separate browser profiles for faculty, HoD, coordinator, invited faculty and student. Preview and submit leave, approve it, invite and accept a substitute, review Before / After, publish, then acknowledge from the student profile. Switch back to the coordinator’s audit and classes-owed screens to show persisted results. [Full demo](README.md#full-mvp-demo-and-audit-history)
3. Show delivery using a fixture with an already ended class. The future class in the core demo gives a useful example of a published recovery with zero delivered credit. [Delivery demo](README.md#delivery-and-ledger-demo-008)
4. For an extensions demo, generate a timetable draft, simulate a room closure, or run an emergency offer race. For automatic emergency fallback, run `npm run worker:emergency` alongside the app. [Generation](README.md#generated-timetable-demo-012) · [Simulation](README.md#what-if-simulation-demo-016) · [Emergency](README.md#emergency-cover-demo-017)

The local demo uses Asia/Kolkata, full-day leave, Monday–Friday teaching by default, HoD-reviewed Saturday exceptions, and in-app updates. Deployment, external messaging, SSO and attendance tracking are outside the current implementation. The in-memory login limiter is scoped to one app process. Treat operational targets from the proposal as targets. [Scope](context/overview.md) · [Technical notes](context/tech.md)

### What was verified for this walkthrough

On Node 24.22.3, typecheck, lint, production build, Prisma schema validation, database connectivity and the client-bundle scan passed. All 61 unit tests and 145 PostgreSQL integration tests passed, as did the two Chrome MVP and audit tests and the two focused emergency tests with a frozen clock. The Chrome runs covered those two suites. The PostgreSQL driver emitted a deprecation warning during the passing runs. [Commands and results](context/progress.md#walkthrough-verification--2026-11-15)

## Mock interview

Answer aloud before reading the suggested response. Use a real example from the app in each answer.

### 1. What problem does SlotWise solve?

It gives a department one workflow for deciding what happens to an actual class when its teacher is absent. I can demonstrate who approves the absence, how the system finds feasible alternatives, who publishes the replacement, and when the system counts the class as delivered.

### 2. Why use Next.js for this React project?

React provides interactive components and form state. Next.js adds file-based routing, layouts, server-side reads and Server Actions. I can fetch a scoped timetable on the server, send a small view model into the editor and run publication and Prisma logic on the server.

### 3. Why are an occurrence and an obligation different records?

An occurrence says when, where and by whom a class is scheduled. The obligation represents the teaching still owed for that weekly unit. When a Monday class moves to Wednesday, the two occurrence records share one obligation, so moving it neither adds a new requirement nor duplicates delivery credit.

### 4. How do you know a suggestion is valid?

The engine checks hard constraints first, such as teacher qualification, availability, section and room clashes, capacity and workload limits. Then it applies the tier order and tie-breakers. At publication the service checks the selected batch again against current records.

### 5. What if two coordinators publish changes involving the same room?

Publication runs in a transaction with department locking, fresh revision and validation checks, and database exclusion constraints on reservations. One valid write can commit. The conflicting or stale request returns feedback and needs a fresh review.

### 6. Does accepting a cover request change the timetable?

Acceptance records permission for the exact assignment. The coordinator still reviews Before / After and publishes, and current eligibility is checked again. The replacement earns minutes only after held delivery is recorded.

### 7. Can a student access a staff operation by typing the URL?

The server independently checks current access on the page and the service. A student can read timetable records for their section memberships. Staff mutations check active identity, role and department, with tighter ownership or assignment rules where needed.

### 8. How do you prove the emergency workflow works under concurrency?

There are real PostgreSQL tests for overlapping accepts, deadline checks and worker retries. One acceptance wins, the other is already filled, and expiry persists once across retries. The browser scenario demonstrates the two faculty views and the coordinator’s separate publication step.

### 9. What does your workload report measure?

Planned utilization is active assigned teaching minutes divided by the configured weekly teaching target. Delivered minutes come from confirmed Held records. Classes owed tracks remaining semester requirements and overdue obligations separately. A published future makeup adds planned coverage and earns zero delivered minutes until confirmed.

### 10. Did you use AI, and what can you explain yourself?

Say you used AI assistance for implementation. Then trace a single feature from UI to Server Action, service, domain logic, database and test. Explain one design trade-off you understand, such as a bounded generation search that can return partial results or a publication transaction that rejects a stale preview. Describe work you can personally demonstrate.

### Follow-up questions about the extensions

| Interviewer asks | Suggested answer |
| --- | --- |
| Does the generator guarantee an optimal timetable? | It searches within time and work limits. It can return a partial feasible proposal, and the normal draft workflow checks completeness before publishing. |
| Why preview a CSV import? | It lets staff inspect row-level failures before writing. The commit verifies the preview and revalidates against current data, then applies the batch atomically. |
| Does the class representative choose the final makeup? | The representative submits one current preference. The coordinator can carry that exact option into review, where the usual scheduling checks apply. |
| What happens when a calendar link is rotated? | The old token stops working and the new one serves the owner’s current scope. Stable obligation IDs let a calendar client recognize that a class moved. |
| What does a room-closure simulation change in the database? | It reads the current baseline and overlays the closure in memory. It returns affected classes, feasible recoveries, and planned workload projections. The transaction is read-only. |
| What happens if the emergency worker stops? | The server still rejects accepts after the deadline. PostgreSQL retains the due round, so a restarted worker can process it and record one fallback. |

## File-by-file reference

The [repository file index](SLOTWISE-FILE-INDEX.md) explains each source, test, migration, configuration and context file. To prepare for a code question, start with a page you can demo and follow its imports into the associated action, service, domain function and test.
