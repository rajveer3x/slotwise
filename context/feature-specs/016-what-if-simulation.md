# 016 What-if timetable simulation

Scope: optional; implement only when selected. Dependencies: 005 and 009; 012 only if full generation is used.

## Goal and flow

Coordinator simulates a room becoming unavailable or a faculty absence and compares affected classes, feasible recoveries and workload before taking action. MVP extension supports these two scenarios only; creating new sections can be added later.

## Operations and boundaries

Clone an authorized immutable scheduling snapshot in memory, apply hypothetical availability changes and call the existing engine. Never change real availability, leave, reservations, notifications or ledger records. Label all results as simulation, show the baseline revision and policy values, and expose incomplete-search status. Optional saved scenarios store inputs/results separately from production scheduling entities. Applying a scenario is not implemented here; users must create actual requests and use normal review/publication.

## Acceptance criteria

1. Given a room closure scenario, when simulated, then affected classes and possible recoveries are shown against the original baseline.
2. Given simulation completion, then production schedule revision, reservations, delivery records and notifications remain unchanged.
3. Given the baseline changed, then a saved result is visibly stale and can be recomputed.
4. Given an unauthorized department scenario, then the server denies access before assembling the snapshot.

## Checks and demo

Assert no production writes, deterministic replay, baseline staleness and permission boundaries. Demo closing a lab hypothetically and showing why some classes remain unresolved.

## Implementation prompt

```text
Read AGENTS.md and relevant context. I am selecting optional feature 016.
Implement context/feature-specs/016-what-if-simulation.md as a read-only
simulation over snapshots. Follow the common completion contract and
update progress. Do not add automatic application of simulated changes.
```
