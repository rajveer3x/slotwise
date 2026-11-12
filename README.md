# SlotWise

A React and Next.js subject project for university timetables and faculty leave recovery. Features **000 and 001** provide the application foundation, real local credential authentication, five role dashboards, server authorization and a minimal admin account-access screen. Timetables and leave workflows remain planned.

## Run locally

Prerequisites: Node.js **24.22.3** (see `.nvmrc`), npm and Docker Compose. Start Docker Desktop first. Use your normal Node manager; these commands assume nvm.

```sh
cd /Users/raj/projects/slotwise
nvm install
nvm use
npm ci
cp -n .env.example .env
```

Edit your ignored `.env`: set `AUTH_SECRET` to a unique random value of at least 32 characters (generate one with `openssl rand -base64 32`), choose a local `DEMO_SEED_PASSWORD` of at least 12 characters and at most 128 UTF-8 bytes, and keep `NEXTAUTH_URL=http://127.0.0.1:3000` for the commands below. Use HTTPS and the real canonical URL for a deployed environment. No secret should have a `NEXT_PUBLIC_` prefix.

```sh
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

Open [SlotWise](http://127.0.0.1:3000) and sign in. The explicit seed command creates these **synthetic** accounts in the Computing demo department:

| Role | Email |
| --- | --- |
| ADMIN | admin@demo.slotwise.test |
| COORDINATOR | coordinator@demo.slotwise.test |
| HOD | hod@demo.slotwise.test |
| FACULTY | faculty@demo.slotwise.test |
| STUDENT | student@demo.slotwise.test |

All use the password you supplied in `DEMO_SEED_PASSWORD` at their first creation. Seeding preserves existing accounts, roles, active status and passwords; changing the environment value does not rotate an existing password. Seeding refuses `NODE_ENV=production` and missing/short passwords. It never runs automatically at startup or build. During feature implementation these five accounts were created locally using a randomly generated password stored only in the ignored `.env`; that file contains the current local demo password. No shared credential is shipped in source.

PostgreSQL listens on `127.0.0.1:5433`; data persists in Docker's volume. Change both password placeholders in `.env` before the first database start if desired. URL-encode punctuation in `DATABASE_URL`. Changing the file does not change credentials inside an existing database volume. `docker compose stop db` stops the service; `docker compose down` preserves its volume. Do not add `--volumes` unless you intend to erase local data.

`db:migrate` applies checked-in migrations without resetting data. Feature 001 adds Department, User, Role, a unique normalized email constraint and the department foreign key. Teaching profiles and student section membership belong to feature 002; this version exposes no teaching or section records.

## Test the feature manually

1. Sign in as faculty, inspect the faculty dashboard and reload. The account remains signed in. Sign out and visit `/dashboard`; authentication is required again.
2. Sign in as student. Visit `/admin` directly: access is denied. Navigation has no account-administration link.
3. In a separate browser profile, sign in as admin. Open **Account access** and revoke the faculty account. Reload the faculty dashboard in its original profile: it returns to login. Reactivate the account from admin and sign in again.
4. Submit an incorrect password five times for one email, then the correct one. Authentication still fails with the same generic message until that account's 15-minute window expires. Successful attempts also count toward the five-attempt window. A separate process-wide limit admits 100 attempts per minute. Restarting the server clears these local demo counters.
5. On a phone-sized viewport, open the Menu with the keyboard, follow Dashboard, and use Escape to close the drawer. Focus returns to Menu. Empty workspace text explains that scheduling data has not been added.

The automated tests additionally change roles in PostgreSQL while an existing session/form remains open, invoke unauthorized server mutations, reject other-department targets and exercise concurrent access writes. No browser role switcher or public registration exists.

## Checks

With Node 24 selected:

```sh
npm run typecheck
npm run lint
npm test
npm run db:validate
npm run db:check
npm run build
npm run check:client-bundle
```

Real-database integration and browser tests use a dedicated database named **slotwise_auth_test**. Set `TEST_DATABASE_URL` in `.env` with the same local connection credentials and this database name. Tests refuse any other database name. Create it once (if it already exists, skip the creation command), then apply migrations:

```sh
docker compose exec -T db createdb -U slotwise slotwise_auth_test
npm run db:test:migrate
npm run test:integration
npm run build
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser tests use installed Google Chrome, start a production server on port 3100 with an ephemeral auth secret and the isolated database, then stop the server. Two workers bound native Argon2 memory and browser load. Alternatively install Chromium with `npx playwright install chromium` and omit `PLAYWRIGHT_CHANNEL=chrome`. The Chromium download was not verified locally.

Tests create their own uniquely scoped synthetic departments/users and remove only those fixtures. They never reset a database. An interrupted process may leave test fixtures in the isolated database; test reruns use new IDs. Screenshots and failure traces go under ignored `test-results/`. Coverage includes password verification, normalized identity, role/department rejection, revocation and role changes, server throttling, concurrent mutations, CSRF, tampered cookies, pending/stale form states, all five login/logout flows, keyboard use, responsive reflow and automated WCAG scans. CSS 200% scaling and axe checks do not establish exhaustive accessibility or screen-reader testing.

The single-process in-memory limiter is suitable only for this local demo; use a shared atomic limiter before a multi-instance deployment. JWT sessions expire after eight hours and carry identity only. Active status, role and department come from the database on protected reads and inside access-write transactions. Logout clears the current browser cookie; there is no durable session registry or global per-token revocation service. HTTP-only/SameSite=Lax auth cookies use Secure on HTTPS and permit local loopback HTTP.

Actual check results and the existing ESLint 9 support limitation are in [progress](context/progress.md). Auth integration details and official references are in [technology](context/tech.md). No deployment is provided.

## React and Next.js concepts to explain

- **App Router/layouts:** `/login` is in `(auth)`; `(app)` supplies the protected shell for `/dashboard` and `/admin`. Route groups do not add URL segments. Loading and error boundaries give feedback while account data is resolved.
- **Server Components:** dashboard/admin pages fetch scoped data on the server. Only minimal account view models and rendered page content cross into the interactive shell; Prisma, hashes and secrets stay in `server-only` modules.
- **Client Components/hooks:** login and logout use React state for pending/error feedback; the menu uses refs and a native modal dialog. Account forms use React 19 `useActionState`.
- **Server Actions:** the account-access action validates form input, calls the authorization service, commits the database transaction and revalidates `/admin`. Stale state produces a refresh message.
- **Authentication and authorization:** Auth.js verifies credentials and signs/encrypts the session token using its CSRF flow. The server independently reloads current permissions. Hiding a navigation link is presentation, not a permission check.
- **Typed reusable UI:** Button, Input, PublicShell and AppShell use typed props and semantic design tokens. Server-rendered `children` can pass through a Client Component without making those page modules client-side code.

Development/build use Webpack because Turbopack's CSS worker failed on this host. System fonts avoid network font downloads. Agent-file generation is disabled to preserve `AGENTS.md`.

## Project context

- [Overview](context/overview.md)
- [Progress and build order](context/progress.md)
- [Technology](context/tech.md)
- [Architecture](context/architecture.md)
- [Domain rules](context/domain-rules.md)
- [UI and UX](context/ui-ux.md)
- [Feature specifications](context/feature-specs/README.md)
- [Authentication specification](context/feature-specs/001-auth-and-roles.md)
- [Agent instructions](AGENTS.md)

All identities and timetable illustrations are project-authored synthetic examples. No real university records or measured impact metrics are presented. Work stops after feature 001; later features require a separate request.
# slotwise
