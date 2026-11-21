# SlotWise domain rules

## Policy defaults

These are implementation-ready demo defaults, not verified institutional rules. One department and active semester; Asia/Kolkata institution timezone; Monday-Friday teaching; Saturday only by explicit HoD exception; Sunday and holidays excluded. Leave is full-day with inclusive local dates. Partial-day leave is future scope. Online teaching is disabled until a department setting explicitly enables it; lab sessions remain in person. The makeup search includes the 14 calendar days following the original date, bounded by semester end and not before the current time.

Store actual class instants as timezone-aware timestamps and user-entered leave/holiday dates as local calendar dates. Never interpret a date-only value as a UTC midnight accidentally. Semester teaching times and workload targets are configurable and seeded as demo examples.

## Entities and relationships

| Entity | Essential fields and relationships |
| --- | --- |
| Department / Semester | timezone, policy settings; local start/end dates, holidays, scheduleRevision |
| User | email, passwordHash, active, role, departmentId; optional faculty profile or section membership |
| Faculty / FacultyAvailability | userId, designation, targetMinutesPerWeek, limits, qualified course IDs; availability intervals |
| Section / SectionMembership | department, semester, strength; student, section, isRepresentative |
| Course / CourseAllocation | course code/type/required contact minutes; course, faculty, section, semester, weekly periods |
| Room / TimeSlot | department, room type/capacity; weekday, start/end local time and label |
| TimetableVersion / Entry | DRAFT or PUBLISHED, effective range, revision; allocation, room, slot span |
| ClassOccurrence | stable ID, originating entry/version, allocation, teachingObligationId, scheduled start/end, assigned teacher, room/mode, schedulingStatus, deliveryStatus |
| TeachingObligation | original required teaching unit, course/section, requiredMinutes; survives rescheduling |
| ResourceReservation | occurrenceId, resource type/id, active time interval; prevents overlap |
| LeaveRequest | faculty, inclusive dates, private reason, status, reviewer, decision timestamps |
| ResolutionPlan / Item | approved leave or not-held source occurrence, baseScheduleRevision, policy snapshot, status; affected occurrence, tier, selected candidate, explanation and rejected alternatives |
| SubstitutionRequest | plan item, invited faculty, proposed interval, status, expiry, response time |
| EmergencyRound / EmergencyOffer | same-day leave occurrence, deadline, lifecycle, exact offers, single winner, proposed fallback |
| SaturdayException | plan item, HOD reviewer, status, reason, approved candidate fingerprint |
| MakeupPoll / MakeupPollOption / PollVote | unresolved obligation, immutable weekday options, base revision, deadline, lifecycle status and at most one current preference |
| DeliveryRecord | obligation/occurrence, confirmed minutes, confirming faculty/coordinator, timestamp; corrections audited |
| Notification / Acknowledgement | recipient, published change ID, safe payload, readAt; unique recipient + change acknowledgement |
| AuditEvent / MutationReceipt | actor, action, scoped entity, safe before/after, reason, time; idempotency key and payload fingerprint |

Implement schema incrementally by feature. Add foreign keys, uniqueness and indexes with their owning feature. Store typed settings rather than unconstrained arbitrary JSON wherever practical.

## Permissions

| Operation | Allowed |
| --- | --- |
| Manage accounts and roles | ADMIN |
| Manage master data, drafts, publication | ADMIN or department COORDINATOR |
| Approve leave and Saturday exceptions | Department HOD; cannot approve own leave |
| Submit/withdraw pending leave | Owning FACULTY, including a HOD with a faculty profile |
| Respond to cover request | Invited active faculty only |
| Launch, cancel and publish emergency cover or fallback | Department COORDINATOR. The launching coordinator publishes the winning offer. |
| Confirm delivery | Assigned faculty or department COORDINATOR; coordinator confirmations/corrections require an audit reason |
| View timetable | Staff within scope; students only their section |
| View workload, ledger, impact, audit | Department COORDINATOR and HOD; ADMIN for administration. FACULTY may view their own workload |
| View private leave reasons | Requesting faculty and authorized HOD only |
| Manage makeup polls | ADMIN or department COORDINATOR |
| View and vote in a section poll | Its designated active student representative. Department managers can view results. |
| Read notifications/acknowledge | Recipient only |
| Read acknowledgement totals | ADMIN or department COORDINATOR |

Scope checks apply to every query and mutation and do not rely on IDs supplied by the client. An ADMIN does not implicitly acquire HoD approval authority. For the demo, requests by a HOD require a different authorized HOD in the department; if none exists, show no eligible approver rather than self-approving. There is no public role-selection signup.

## Timetable and occurrences

Weekly entries are templates; leave acts only on dated occurrences. Materialize occurrences for the semester, skipping holidays, using a uniqueness key that makes retries safe. Published edits apply prospectively from an explicit effective date, preserve stable obligation identities, and never rewrite delivered history. Require manual review for future occurrences already affected by published leave resolutions; do not overwrite them from a regenerated template.

Feature 003 demo details: a lab occupies at least two complete consecutive configured slots; weekly period counts sum the covered slots. Publication requires every unarchived allocation in the selected semester to meet its weekly count. Each entry’s stable series plus local Monday week date identifies a teaching obligation across weekday moves. Its allocation and duration remain fixed once materialized. Initial/prospective template publication is Monday–Friday, in person, through semester end; changes use an explicit current/future effective date.

Hard constraints: no teacher/section/room overlap; sufficient room capacity; lab suitability and consecutive slots; teacher qualification and availability; leave absence; configured daily/weekly teaching limits; allowed teaching days. These remain hard even for Saturday exceptions. Conflict output identifies the resource, interval and rule without disclosing private data.

Scheduling status is ACTIVE or CANCELLED. Delivery status is PENDING, HELD or NOT_HELD. Substitution and rescheduling are resolution metadata, not proof of delivery. A reschedule cancels the old active occurrence and creates a linked replacement for the same obligation. An accepted substitute becomes assigned only on publication. Published leave approval marks affected future occurrences unavailable for normal teaching and cancels their active reservations, retaining their obligations as unresolved. This mutation increments schedule revision atomically.

## Leave transitions

DRAFT (local form) -> SUBMITTED -> APPROVED or REJECTED; SUBMITTED -> WITHDRAWN by owner. Reject overlapping submitted/approved leave for the same faculty. Approval rechecks current affected occurrences and eligibility. Past leave is not supported in the demo. Approved leave cannot be casually edited or withdrawn in the MVP; report that reversal needs a separately reviewed scheduling change. Never restore a cancelled class through a generic status update.

An impact preview is read-only and provisional. Approval and later publication independently revalidate. If no classes are affected, leave may still be approved and the UI explains that no resolution is needed.

## Resolution ladder

1. Substitute: qualified, available faculty at the original interval, with original section and suitable room. Invite and require acceptance; invitation alone is not coverage.
2. Swap: two occurrences in the same section exchange times. Both teachers, rooms, durations and limits must work at both destinations; the absent teacher must be available at the other date. Apply both sides atomically. MVP swaps require equal durations and same course delivery type.
3. Weekday makeup: original teacher, section and suitable room free within the search window, outside the approved leave.
4. Online makeup: allowed policy and non-lab course; original teacher and section free during allowed weekday hours. Relax room requirement only. Require a valid meeting URL before publishing; do not embed arbitrary HTML.
5. Saturday makeup: teacher, section and room otherwise valid; exact candidate needs HoD approval with recorded reasons for earlier tiers failing.

The engine returns the first tier with usable candidates and up to three ranked alternatives. A pending substitute offer is not a final usable resolution: while waiting, show pending status; on decline/expiry try remaining candidates then later tiers. Staff can explicitly reject candidates with a reason and recompute; do not silently skip earlier feasible tiers. Revalidate the whole selected batch so a resource is not allocated twice across items. Deterministic greedy batch processing is acceptable but not a proof of global optimality; label unresolved items and search limits honestly. No available option means UNRESOLVED, never a forced clash.

Use deterministic tie-breaks. For substitutes: exact qualification is mandatory, then lower assigned teaching/target ratio, fewer confirmed covers in the current month, then stable faculty ID. Exclude faculty without a positive target from ratio ranking and explain missing configuration.

For weekday slots use a versioned integer score: +30 if it fills a section gap, +15 if adjacent to an existing class, -10 per teaching period above the section's configured preferred daily count after placement, -5 for the final teaching period, -1 per calendar day of delay. Hard limits are checked before scoring. These are tunable demo weights. Prefer earlier date/time and stable room ID on ties. Show each score contribution. Saturday is a separate approval tier, never just a score penalty that can defeat weekday policy.

## Publication and acceptance

Plan states: DRAFT -> READY -> PUBLISHED or SUPERSEDED. Only fully valid, explicitly selected items may publish. For MVP publication is all-or-nothing for the selected subset; unselected unresolved items remain visible. Publishing a subset advances the revision and invalidates remaining old previews. Match accepted cover requests and Saturday approvals to the exact candidate fingerprint; a changed candidate needs a new response/approval.

Core cover invites are coordinator-initiated with configurable expiry, default 24 hours capped by class start; skip requests that are already expired. Multiple accepts for one class cannot become multiple assignments. Acceptance rechecks timing and eligibility but does not reserve resources; publication rechecks again and may invalidate an accepted option if resources changed. Explain this distinction in the UI.

## Emergency cover

A coordinator can open one live round per unresolved occurrence linked to approved leave and scheduled for today in Asia/Kolkata. All current eligible substitutes receive exact offers. The default window is five minutes, capped by class start, with an exclusive deadline. The first valid acceptance sets the winner and closes the other offers. Publication rechecks the winner and uses the launching coordinator’s existing draft and review flow. A coordinator can cancel an unpublished round to relaunch or choose another option.

At expiry without a winner, the worker proposes the first feasible tier after substitution and sends one in-app notice to the launching coordinator. The recovery board skips the substitute tier after expiry. Explicitly opening a new round enables a fresh substitute search. If the board or resources changed, recheck the recommendation or recompute before publishing. No round operation creates reservations or delivery credit.

## Advisory makeup voting

Each section can have one unarchived representative designation. The student account must be active to vote. Managers clear or archive the old designation before appointing a replacement. Any pre-existing ambiguous designation blocks voting until corrected.

Managers offer two or three current tier-3 weekday candidates for one unresolved obligation. The deadline must precede all offered starts. Votes may be replaced until the deadline, which is exclusive, or until the poll is closed, cancelled, superseded or the class is resolved. Changing the set of options creates a new poll and preserves the previous snapshots and preference. A closed poll with no response leaves the choice to the coordinator.

Votes express a preference. They produce no reservations, timetable changes, attendance or delivery credit. A coordinator may carry the exact offered candidate into the normal draft and must run the current scheduling preview and publication checks. A stale candidate requires recomputation.

## Notifications

A recovery publication records one notification per active recipient. The audience includes affected faculty on both sides of a change, students in affected sections with active memberships, and departmental coordinators, HoDs and administrators. The publication stores before/after assignment details and each recipient's affected obligations. The timetable link resolves the current active occurrence of that teaching obligation. A separate acknowledgement, unique per recipient and recovery publication, records that the user saw an update. Marking read does not acknowledge. Acknowledging also records the notification as read and has no effect on attendance, consent, delivery or contact minutes. Aggregate counts use the original recorded audience.

## Contact minutes and workload

Maintain semester required contact minutes per course allocation and stable teaching obligations. Count each obligation's delivered minutes once, including linked replacements. Default delivery confirmation is for the full scheduled duration after class end; partial delivery and split makeups are future scope. Duplicate confirmations are idempotent. Coordinator confirmations and corrections require an audit reason. A correction reverses/replaces the current credited record and retains the old record; it cannot override an already published replacement. A separately reviewed scheduling reversal is outside this MVP.

Semester outstanding = max(0, required contact minutes - unique confirmed delivered minutes). Overdue = due obligation minutes up to now minus delivered minutes for those obligations, floored at zero. Future planned classes are outstanding, not overdue. For materialized units, due time is the earliest scheduled end in the obligation history; an overdue unit remains overdue while future recovery is only planned. Report planned coverage separately. A reschedule does not add a new requirement; accepted cover does not create delivered minutes.

For the MVP show scheduled and delivered teaching minutes separately per week. Planned utilization = assigned active teaching minutes / faculty target minutes for that week, including substitute assignments once. Confirmed covers and earned credit are separate recognition counters; do not add credit again to teaching load. Demo bands: below 0.9 under target, 0.9-1.1 balanced, above 1.1 over target. Workload groups planned and delivered minutes by the assignment’s institution-local date in a Monday–Sunday week. Apply the current configured weekly target without prorating for holidays. Confirmed covers require current HELD tier-1 delivery records. Hard workload limits still apply independently. Advanced weighted administrative/project duties are deferred.

## Reports and audit

Planned weekday recovery rate = unique obligations with a published weekday recovery / all unique obligations linked to approved leave on affected class dates in the inclusive period. Follow each obligation across the complete replacement history, including published recoveries outside the period. Classify the obligation by its active or currently confirmed HELD published recovery. A missed recovery with neither is unresolved. Show the Saturday and unresolved counts, and count delivered recoveries separately using current HELD records. A “Saturdays avoided” metric would require an explicit comparable baseline.

Audit actor, action, timestamp, affected IDs, safe before/after and reasons. Normal application roles cannot edit audit events. This is application-level append-only history, not a claim of cryptographic tamper-proof storage. Do not include passwords, tokens or private leave reasons in general audit views.

## Calendar subscription policy

Each owner can have one live link for their own unarchived faculty profile (FACULTY or HOD), or one live link per unarchived student membership in an unarchived section and semester. A teaching-profile feed spans unarchived semesters. Access is re-evaluated against the current account, role and scope on each request. Restoring account or scope access can restore a still-live link. Rotation and revocation invalidate the previous token permanently.

A calendar event represents a teaching obligation. A published active assignment in scope replaces any earlier cancellation for that obligation. When no active assignment remains in scope, show the most recent scoped cancellation at its previous time for 30 days from cancellation. Pre-existing cancellations receive one 30-day window from migration. A reassigned teacher sees their old cancellation, and the section sees the current assignment. Calendar cancellation follows scheduling status. Published event fields are limited to the course, section, room or online mode, and time. Cancellation entries use a generic title and the original interval.
