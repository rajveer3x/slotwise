# 011 Audit viewer and MVP verification

Scope: MVP. Dependencies: 010.

## Goal and flow

Authorized staff inspect the audit trail already produced by earlier workflows. Complete the role-based demo and verify that the MVP is coherent. This feature creates an audit viewer; it must not invent historical audit data for actions that were never logged.

## Implementation

Provide scoped, paginated filters for actor, action, entity and date with safe before/after details. Display reasons and timestamps. Normal application users cannot update/delete audit entries. Do not call this cryptographically tamper-proof. If earlier actions lack required events, fix their transaction paths and test new events; disclose missing old history rather than fabricating it.

Add deterministic demo scenarios for substitute, weekday fallback, Saturday exception, unresolved case, stale publish and forbidden operation. Provide a brief demo guide in the project README, including synthetic-data labels and known limitations. Finish relevant responsive, keyboard, error-state and empty-state checks.

## Acceptance criteria

1. Given timetable, leave and publication mutations, then audit records identify actor, time and change without exposing private secrets/reasons.
2. Given an unauthorized role or other department, when querying audit details, then the server denies access.
3. Given the full faculty -> HoD -> coordinator -> substitute -> student flow, when run in a browser against persisted data, then the schedule, ledger and notifications remain consistent after reload.
4. Given required checks cannot run, then progress explicitly marks the MVP unverified rather than complete.
5. Given demo instructions, then another person can start locally and reproduce the key flow using documented synthetic accounts.
6. Given the implemented screens at the viewport sizes, keyboard/zoom settings and reduced-motion mode specified in [ui-ux.md](../ui-ux.md), then the main flow remains usable, essential text/status contrast is checked, and actual visual verification results are recorded.

## Checks and demo

Run typecheck, lint, production build, domain/integration tests and the main browser flow. Record exact results, environment limitations and remaining criteria. Test no data leaks in student payloads and no audit mutation UI/API. End with a concise explanation of demonstrated React/Next.js concepts.

## Implementation prompt

```text
Read AGENTS.md and relevant context. Implement
context/feature-specs/011-audit-and-demo-verification.md. Verify the full
MVP against real persistence, fix gaps within this scope, document honest
results and update progress. Do not begin optional features automatically.
```
