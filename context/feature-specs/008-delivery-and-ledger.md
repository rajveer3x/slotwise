# 008 Delivery confirmation and contact-minutes ledger

Scope: MVP. Dependencies: 007.

## Goal and flow

Assigned faculty records a class as held or not held after its end. Coordinators can confirm/correct with an audit reason. The ledger shows required semester minutes, unique delivered minutes, future planned coverage, outstanding and overdue minutes by course and section.

## Data and operations

Implement DeliveryRecord and queries using stable obligation IDs from domain-rules.md. Default confirmation credits the full scheduled duration; partial credit and split recovery are outside MVP. A not-held class releases its now-past active reservation if needed and leaves its obligation unresolved; offer it for coordinator recovery using the existing engine's obligation-based input. Preserve the leave-report source so ordinary not-held events are not misclassified as leave.

Prevent duplicate credit across original and replacement occurrences. Corrections reverse/replace the credited record transactionally and append audit events. Recompute metrics from authoritative records, not client-maintained counters. Mark future required minutes outstanding but not overdue. Confirmation is not student attendance.

## Acceptance criteria

1. Given a future or ongoing class, when marking it held, then server validation rejects premature confirmation.
2. Given an ended assigned class, when confirmed held, then its obligation receives credit once.
3. Given an original and linked makeup, when duplicate confirmations are attempted, then delivered minutes cannot exceed the obligation through double counting.
4. Given a scheduled or accepted makeup that has not occurred, then delivered minutes remain unchanged.
5. Given a correction with an authorized actor and reason, then totals update and both old and new states remain auditable.
6. Given a class marked not held, then the overdue obligation remains visible for recovery without creating a second requirement.

## Checks and demo

Unit-test minute formulas, future/overdue distinction and obligation chains. Integration-test concurrent confirmation and correction. Demo a 60-minute obligation before scheduling, after rescheduling and after delivery; only delivery changes earned minutes.

## Implementation prompt

```text
Read AGENTS.md and ledger rules. Implement
context/feature-specs/008-delivery-and-ledger.md. Keep scheduling status
separate from delivery and count each obligation once. Follow the common
completion contract and update progress.
```
