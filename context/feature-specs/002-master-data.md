# 002 Master data and demo fixtures

Scope: MVP. Dependencies: 001.

## Goal and flow

Authorized staff configure the teaching data through searchable, validated forms. Provide tabs for semester/holidays, faculty/availability, courses/qualifications, sections/memberships, rooms, teaching slots and allocations. Limit user/role assignment to ADMIN; department COORDINATOR can manage teaching records within scope.

## Data and rules

Implement the entities in domain-rules.md with foreign keys, uniqueness, positive capacities/durations/targets and valid semester boundaries. Store qualification as explicit course relationships. Define weekly periods and required semester contact minutes separately. Archive referenced records instead of deleting history. Reject changes that would invalidate a published schedule unless applied through a reviewed scheduling flow; add this guard when publication exists.

Create deterministic synthetic fixtures: at least two sections, six faculty, four courses, three rooms including a lab, a configured semester and student memberships. Add a second department's small fixture to test isolation. Make the seed idempotent and refuse destructive production resets. Record that capacities, workload limits and identities are demo examples.

## Acceptance criteria

1. Given an authorized coordinator, when valid scoped data is submitted, then it persists and is visible after reload.
2. Given an invalid interval, capacity, duplicate code or unrelated foreign key, when saving, then the server rejects it with useful field feedback.
3. Given another department's record ID, when reading or modifying it, then scope enforcement denies access.
4. Given a referenced room or faculty, when removal is attempted, then references remain intact and the UI explains archival/dependency rules.
5. Given the seed already ran, when rerunning it, then duplicate users and teaching records are not created.

## Checks and demo

Test validation, uniqueness, foreign-key scope, seed reruns and archival. Demonstrate creating a room and allocation, then rejecting an invalid entry. CSV import is feature 013, not required here.

## Implementation prompt

```text
Read AGENTS.md and relevant context. Implement
context/feature-specs/002-master-data.md with persistent scoped CRUD and
synthetic seed data. Reuse auth and validation conventions. Follow the
common completion contract and update progress.
```
