# 015 Revocable calendar feeds

Scope: optional; implement only when selected. Dependencies: 007.

## Goal and flow

A user creates a private calendar subscription URL for their own authorized faculty or section schedule, copies it, and can revoke or rotate it. External calendar clients control refresh frequency; do not promise instant synchronization.

## Operations and boundaries

Add a feed subscription with owner, scope and hashed high-entropy bearer token. Return the secret URL only at creation/rotation; never log it. A Route Handler validates token, active owner and current scope before emitting standards-compliant iCalendar with a maintained library. Use stable event UIDs and change sequences so reschedules update existing events. Represent cancellations consistently, including cancelled events for a documented retention window. Preserve timezone semantics and escape text. Do not include private leave reasons or general user data.

## Acceptance criteria

1. Given a valid authorized token, when fetching, then the calendar contains only the owner's current allowed events.
2. Given a revoked token, deactivated owner or lost section permission, then access fails.
3. Given a reschedule, then the same logical event updates with stable identity rather than duplicating the obligation.
4. Given a cancelled event, then its cancellation is represented so a subscribing client can remove/update it.

## Checks and demo

Parse generated feeds in a test library; test escaping, Unicode, dates, token revocation and unauthorized scope changes. Demonstrate feed creation, an event update and revocation. External provider account integration is not required.

## Implementation prompt

```text
Read AGENTS.md and relevant context. I am selecting optional feature 015.
Implement context/feature-specs/015-calendar-feeds.md with revocable
scoped tokens and stable event identities. Follow the common completion
contract and update progress.
```
