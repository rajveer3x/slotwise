# 004 Leave requests and impact preview

Scope: MVP. Dependencies: 003.

## Goal and flow

Faculty chooses inclusive leave dates, sees affected dated classes and submits a request. HoD reviews and approves/rejects. The owner may withdraw a pending request. Preview initially shows affected classes and minutes; candidate-tier coverage counts are added by feature 005, never fabricated now.

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
context/feature-specs/004-leave-and-impact-preview.md against real dated
occurrences. Keep previews read-only and approvals transactional. Follow
the common completion contract and update progress.
```
