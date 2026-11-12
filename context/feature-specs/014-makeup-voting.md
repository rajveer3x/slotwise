# 014 Makeup option voting

Scope: optional; implement only when selected. Dependencies: 005 and 007.

## Goal and flow

Coordinator offers two or three currently valid weekday options for one unresolved obligation. The section's designated representative chooses a preferred option before the deadline. The coordinator reviews the result and republishes only after current availability checks. This is an advisory preference, not a booking.

## Operations and boundaries

Add MakeupPoll, immutable option snapshots and PollVote. Demo policy: one active representative per section; one vote per poll, replaceable before close. Poll states OPEN, CLOSED, CANCELLED and SUPERSEDED. Store deadline and base revision. Changing options creates a new poll and supersedes the old one. No response leaves the decision to the coordinator; do not invent a winning vote. Widening voting to all students is a separate policy change.

## Acceptance criteria

1. Given the section representative and an open poll, when voting, then one saved preference is visible after reload.
2. Given a nonrepresentative, another section or a closed poll, when voting, then the server rejects it.
3. Given repeated/replaced votes, then the poll retains one current preference for the representative.
4. Given a winning option is no longer available, then it cannot publish and the coordinator sees a recompute message.

## Checks and demo

Test exact deadline boundary, scope, vote replacement and stale candidates. Demo preference, closure and revalidated publication. Do not count votes as attendance or timetable approval.

## Implementation prompt

```text
Read AGENTS.md and relevant context. I am selecting optional feature 014.
Implement context/feature-specs/014-makeup-voting.md as advisory section
representative voting. Preserve publication validation. Follow the common
completion contract and update progress.
```
