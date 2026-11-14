# 004 Leave requests and impact preview

Scope: MVP. Dependencies: 003.

## Goal and flow

Faculty chooses inclusive leave dates, sees affected dated classes and submits a request. HoD reviews and approves/rejects. The owner may withdraw a pending request. Preview initially shows affected classes and minutes; candidate-tier coverage counts are added by feature 005, never fabricated now.

## UI alignment

Follow [ui-ux.md](../ui-ux.md) and its future-file pattern. Use the existing LPU AppShell with rounded white request/preview panels on the pale workspace. Place the request form and impact preview side by side when space permits and stack them on phones. Reuse labelled date fields, readable class summaries and shared charcoal action buttons. Lime/lavender provide restrained accents; approval, pending, rejection and stale states retain explicit labels and semantic feedback colors.

This feature is implemented. Preserve current forms, authorized request lists, private-reason boundaries and HoD decisions during UI maintenance. Keep preview, submit and approve visibly distinct. If feature 005 is present, retain its real provisional coverage estimates with their draft/estimate wording. Do not mark a class covered or delivered based on a visual status alone.

## Data and operations

Create LeaveRequest and authorized list/detail queries. Validate dates, semester range, overlaps and ownership. Use institution-local dates. Preserve private reasons only for owner/approver. Impact queries are read-only. On approval requery current future occurrences, mark them cancelled/unavailable for normal teaching, release their reservations, preserve obligations, increment revision and audit the mutation atomically. Later resolution publication creates valid replacements or cover assignments. No class is marked held by approval.

Reject self-approval and outdated request status. Approved request reversal is outside MVP; explain the limitation in the UI. Rejection requires a reason visible to the requesting faculty. Requests with zero affected classes are allowed.

## Acceptance criteria

1. Given two occurrences inside the selected local dates, when previewing, then exactly those classes and their minutes appear with no persisted schedule changes.
2. Given overlapping pending/approved leave or a past date, when submitting, then validation rejects it.
3. Given a submitted request, when the authorized HoD approves, then current affected classes are cancelled for normal teaching, obligations remain, and one audit event set is written.
4. Given another faculty member or a self-approving HoD, when attempting approval, then the server rejects it.
5. Given a rejected or withdrawn request, when approval is retried, then status cannot silently change to approved.
6. Given a student timetable query, then private leave reasons never appear in the response.

## Checks and demo

Test inclusive local boundaries, no affected classes, changed timetable between preview and approval, state races, privacy and transaction rollback. Demonstrate preview, submission and separate-user approval.

## Implementation prompt

```text
Read AGENTS.md and relevant context. Implement
context/feature-specs/004-leave-and-impact-preview.md. Read context/ui-ux.md
and reuse the implemented LPU form/preview layout and shared controls.
Inspect existing code and preserve working behaviour against real dated
occurrences. Keep previews read-only and approvals transactional. Follow
the common completion contract and update progress.
```
