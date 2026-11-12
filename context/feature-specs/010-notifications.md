# 010 In-app notifications and acknowledgement

Scope: MVP. Dependencies: 007 and 009.

## Goal and flow

Users read persisted schedule-change notifications and navigate to their current timetable. They can mark notifications read and acknowledge published changes. Coordinators see aggregate acknowledgement counts for a change, not a claim of attendance or consent.

## Data and operations

Reuse notification records already written by publication. Add recipient-scoped list/unread queries, mark-read actions and a unique `(recipientId, publicationId)` acknowledgement. Resolve recipients from authoritative section membership and affected faculty at publication time. Store safe before/after summaries without private leave reasons. Distinguish historical change details from the latest timetable if another update superseded it.

Refresh on navigation and mutations; optional modest polling only if justified. No email, browser push, external credentials or mandatory SSE. Optimistic read state may roll back on failure; acknowledgement remains a server-recorded fact.

## Acceptance criteria

1. Given a published change, then each affected eligible recipient has one notification even after publication retry.
2. Given another user's notification ID, when reading or mutating it, then access is denied.
3. Given repeated acknowledgement, then one acknowledgement record exists and aggregate count does not increase twice.
4. Given a superseded timetable change, then the notification identifies its historical date and links to the current view without silently showing the old time as current.
5. Given a failed optimistic mark-read request, then UI state recovers and displays a retryable error.

## Checks and demo

Test recipient deduplication, permission boundaries, retries and acknowledgement aggregation. Browser-test mobile notification navigation and unread state. Demo a student acknowledging a published change and the coordinator's updated count.

## Implementation prompt

```text
Read AGENTS.md and relevant context. Implement
context/feature-specs/010-notifications.md using persisted in-app
notifications. Add acknowledgement without treating it as attendance.
Follow the common completion contract and update progress.
```
