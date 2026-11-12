# 012 Automatic timetable generation

Scope: optional; implement only when selected. Dependencies: 003 and completed MVP recommended.

## Goal and flow

Coordinator generates a proposed weekly timetable, reviews quality and unresolved allocations, then opens it as a draft in the existing editor. Generation never directly publishes. Use a deterministic TypeScript heuristic with a bounded runtime, seed and cancellation checks. Python/OR-Tools comparison is future scope.

## Operations and boundaries

Reuse hard-constraint validators. Rank allocations by difficulty, place greedily, attempt bounded backtracking, then improve soft objectives without introducing hard violations. Report completed search, timeout, cancelled, or partial draft honestly. “No solution found” does not prove infeasibility. Record input revision, policies, runtime, seed and quality components. A partial draft cannot publish as a complete timetable until required allocations are resolved or scope explicitly changes.

If work exceeds request limits, add a durable GenerationJob and worker; default to a PostgreSQL-backed queue after checking current compatibility. Do not pretend a fire-and-forget server promise is durable. Show queued/running/completed/failed/cancelled states and bounded retries. Keep the engine independent from queue infrastructure.

## Acceptance criteria

1. Given feasible fixture data, when generating, then the output satisfies all hard constraints and accounts for required allocations.
2. Given a constrained fixture or timeout, then incomplete allocations and search status are visible; the UI never labels a partial result clash-free and complete.
3. Given identical input and seed, then repeat runs produce matching deterministic results.
4. Given a stale result, when attempting publication through the editor, then normal revision checks apply.

## Checks and demo

Run feasible/infeasible/timeout fixtures and measure runtime on stated dataset size. Demonstrate generation, manual review and existing publication validation. No unmeasured speed claims.

## Implementation prompt

```text
Read AGENTS.md and scheduling context. I am selecting optional feature
012. Implement context/feature-specs/012-timetable-generation.md with a
bounded TypeScript engine and honest partial-result states. Follow the
common completion contract and update progress.
```
