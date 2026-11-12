# 007 Timetable change preview and publication

Scope: MVP. Dependencies: 006.

## Goal and flow

Coordinator selects valid resolution items, reviews before/after teacher, time and room, sees affected recipients and unresolved items, then publishes the selected subset. One invalid selected item rolls back the whole selected batch. Unselected items remain unresolved and must be recomputed against the new revision.

Use the Before/After comparison and blocker treatments in [ui-ux.md](../ui-ux.md). Stack labelled comparison blocks on phones. Keep the final “Publish N changes” action on the standard project button with pending/disabled states; optional animated landing buttons must not replace this critical control.

## Data and operations

Extend feature 003's shared scheduling transaction. Recheck role/scope, base revision, obligation status, leave, availability, qualifications, accepted substitute fingerprint and Saturday approval. Reserve all resources across the selected batch. For reschedules create a replacement linked to the existing obligation; for substitutions restore the affected teaching occurrence with the accepted assigned faculty; swaps update both sides atomically. Preserve original before-state and cancelled history.

Persist publication ID, safe change details, audit events and per-recipient notification records in the same transaction. Use an idempotency key plus payload fingerprint. No external messages. Mark committed plan items published and stale leftovers superseded/recompute-needed. Never treat a preview or accepted invitation as a reservation.

## Acceptance criteria

1. Given a valid selected batch, when publishing, then all selected changes, reservations, audit and notifications commit together.
2. Given one conflicting selected item, when publishing, then none of the selected schedule changes commit.
3. Given the schedule revision changed after preview, when publishing, then the server returns a stale-preview result and asks for recomputation.
4. Given the same successful request is retried, then it returns the prior result without duplicate occurrences or notifications.
5. Given two publications compete for a resource, then at most one succeeds and no overlap remains.
6. Given unresolved unselected items, when a subset publishes, then those items remain explicitly unresolved and their old previews cannot publish unchanged.
7. Given a class is rescheduled, then its required teaching minutes are not increased and it is not marked delivered.

## Checks and demo

Use real database tests for concurrent publication, rollback, duplicate keys and changed-payload key reuse. Browser-test preview, publication, stale recovery and student timetable refresh. Demo one before/after change and a rejected stale preview.

## Implementation prompt

```text
Read AGENTS.md and all scheduling context. Implement
context/feature-specs/007-preview-and-publish.md using the shared
transaction protocol. Verify race conditions and atomic rollback, not
only the happy path. Follow the common completion contract and update progress.
```
