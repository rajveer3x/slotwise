# 017 Emergency same-day cover

Scope: optional; implement only when selected. Dependencies: 006, 007 and 010.

## Goal and flow

For approved same-day leave, coordinator launches a short emergency round to eligible substitutes. All receive in-app offers; the first valid accepted response wins the round. Other offers close. If nobody accepts before expiry, the coordinator receives the next-tier recommendation. Coordinator publication remains required.

## Operations and boundaries

Add EmergencyRound with OPEN, WON, EXPIRED or CANCELLED state and a winner reference. Default response window is five minutes capped by class start; no round starts for an already started class. Acceptance atomically locks the round, revalidates eligibility and claims the single winner. Schedule publication still rechecks resources. If the accepted candidate later becomes invalid, coordinator explicitly launches a new round or selects another tier.

Unlike core lazy expiry, automatic fallback here requires durable scheduled work. Use a verified PostgreSQL-backed job mechanism and idempotent expiry handler; do not rely only on a browser timer or an unawaited promise. Handle worker restart and duplicate execution. In-app delivery is best effort and is not external push; communicate this limitation.

## Acceptance criteria

1. Given two simultaneous valid accepts, then exactly one faculty wins and the other receives an already-filled result.
2. Given an expiry boundary or changed availability, then an invalid late response cannot win.
3. Given no winner at expiry, then one fallback event is recorded and the next tier is proposed without automatic publication.
4. Given a worker restart or duplicate job execution, then expiry/fallback does not create duplicate rounds, notifications or assignments.

## Checks and demo

Use real database concurrency tests, frozen-time expiry checks and worker retry/restart tests. Demo two offer tabs racing to accept and a separate expiring round. Record delivery limitations honestly.

## Implementation prompt

```text
Read AGENTS.md and relevant context. I am selecting optional feature 017.
Implement context/feature-specs/017-emergency-cover.md with atomic winner
selection and durable expiry. Follow the common completion contract and
update progress. Keep coordinator publication mandatory.
```
