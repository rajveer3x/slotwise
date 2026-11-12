# 006 Cover responses and Saturday exceptions

Scope: MVP. Dependencies: 005.

## Goal and flow

Coordinator invites a ranked faculty member to cover an exact occurrence. The invited faculty sees course, section, local time, room and expiry and accepts or declines. HoD separately reviews an exact Saturday candidate and why earlier tiers failed. Neither response publishes the schedule.

## Data and operations

Add SubstitutionRequest and SaturdayException with explicit status, timestamps and candidate fingerprint. Core invitation states: PENDING -> ACCEPTED, DECLINED, EXPIRED or CANCELLED. Default expiry is 24 hours capped by class start. Check expiry using server time on every read/action; no background worker is needed for enforcement. Coordinator may advance to the next candidate after decline/expiry. Record actions and notify involved staff through persisted in-app records.

Acceptance atomically checks ownership, active status, pending state, current eligibility and competing accepted requests for the same obligation. It does not reserve resources; tell users publication may still fail if the schedule changes. Candidate changes invalidate previous acceptance/exception approval. HoD cannot approve their own request's exception.

## Acceptance criteria

1. Given a pending invitation, when the invited faculty accepts before expiry, then exactly one accepted response is stored.
2. Given a different user or an expired invitation, when accepting, then the server rejects it.
3. Given concurrent accept/decline or two competing accepts, then only a valid single final state/selected cover wins.
4. Given a declined candidate, when the coordinator recomputes, then the next eligible candidate or tier is offered with history preserved.
5. Given Saturday requires approval, when an exact candidate is approved with a reason, then only that candidate becomes eligible for publication.
6. Given a later change to the candidate time/room/faculty, then old acceptance or approval cannot authorize it.

## Checks and demo

Test expiry at the exact boundary, competing responses, no self-approval and candidate fingerprints. Demonstrate faculty accept and HoD exception approval with distinct authenticated accounts. Automatic mass invitations belong to feature 017.

## Implementation prompt

```text
Read AGENTS.md and relevant context. Implement
context/feature-specs/006-cover-response-and-exceptions.md. Use real
authorized responses, server expiry checks and exact-candidate approvals.
Follow the common completion contract and update progress.
```
