# 001 Authentication and role access

Scope: MVP. Dependencies: 000.

## Goal and flow

Users sign in with seeded local credentials and see the correct role-scoped navigation. Implement login/logout, server session resolution, active-user checks and a minimal dashboard for ADMIN, COORDINATOR, HOD, FACULTY and STUDENT. No public registration, SSO, role selector or password recovery service is required.

## Data and server operations

Create Department and User plus the minimum identity relationships needed for scoping; feature 002 completes teaching profiles. Normalize email with a unique constraint. Use Auth.js with an explicitly documented credentials-compatible session strategy and Argon2id hashes. Keep provider secrets on the server. Resolve active role and department from trusted storage on privileged requests. Use secure cookie settings appropriate to local HTTPS/HTTP and production; follow the selected auth library's CSRF flow.

Add shared `requireSession` and scoped authorization helpers. Login must use generic failure text and server-enforced attempt throttling. A local single-process limiter is acceptable only if documented as unsuitable for multi-instance production. Seed users only through an explicit development command and password environment variable; do not ship shared production credentials.

## Acceptance criteria

1. Given valid active credentials, when signing in, then the correct dashboard and navigation appear and persist after reload.
2. Given invalid credentials, when signing in, then no session is created and a generic error is shown.
3. Given a STUDENT, when directly invoking an admin operation, then the server denies it with no mutation.
4. Given a revoked user or changed role, when a privileged operation runs, then current database permissions apply despite stale session claims.
5. Given repeated failed logins, when the limit is reached, then throttling applies on the server.
6. Given a session, when logging out, then subsequent protected requests require authentication.

## Checks and demo

Integration-test role and department rejection, revocation, password verification and throttling. Browser-test login/logout and keyboard validation. Demonstrate two real seeded accounts. Explain server authentication versus client navigation visibility.

## Implementation prompt

```text
Read AGENTS.md and relevant context. Implement
context/feature-specs/001-auth-and-roles.md. Verify foundation first;
build real authentication and scoped server authorization, not a mock
role switch. Follow the common completion contract and update progress.
```
