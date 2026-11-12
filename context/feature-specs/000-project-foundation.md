# 000 Project foundation

Scope: MVP. Dependencies: none. State: planned; implementation status lives in progress.md.

## Goal and boundaries

Create a runnable Next.js/React/TypeScript foundation without implementing the rest of the product. Preserve the documentation. Read tech.md before selecting compatible supported versions; record the actual result. Establish Tailwind styling, basic layout, PostgreSQL/Prisma connectivity, environment examples, and meaningful quality scripts. Authentication is feature 001.

## Implementation

- Scaffold safely in this nonempty directory; do not overwrite AGENTS.md or context.
- Add package scripts, one lockfile, runtime version, TypeScript strict mode and framework-compatible lint configuration.
- Establish semantic colors, typography, spacing and basic button/input styles from [ui-ux.md](../ui-ux.md). Use the adapted warm-neutral and blue SlotWise design, not the reference site's markup or branding. Do not install optional component libraries during foundation.
- Add a basic responsive SlotWise landing page linking to a clearly labelled pending login experience; no fake dashboard statistics. Follow the landing composition in ui-ux.md and keep optional motion within its limits.
- Add `.gitignore`, placeholder `.env.example`, local database Compose file with local-only port binding, and Prisma configuration. Do not require a destructive reset to start.
- Set up Vitest and browser test tooling with a small real rendering/navigation check; do not build empty tests solely to claim coverage.
- Replace the README's documentation-only run instructions with verified installation, database and development commands while preserving links to this kit.

## Acceptance criteria

1. Given a fresh checkout and documented environment, when dependencies and the local database are started, then the app renders the landing page.
2. Given the project, when typecheck, lint, build and the foundation test run, then they pass or a specific environmental blocker is recorded without claiming success.
3. Given server environment variables, when client bundles are inspected, then no secrets or database client are exposed.
4. Given existing context files, when scaffolding finishes, then their content remains intact.
5. Given the landing page at phone and desktop widths, with keyboard navigation or reduced motion enabled, then the primary content/action is readable and usable, with visible focus and no page-wide overflow.

## Checks and demo

Verify desktop/mobile rendering, one browser navigation test and database connectivity. Demonstrate the app starting from README steps. Record installed versions and actual scripts in tech.md. No deployed URL is required.

## Implementation prompt

```text
Read AGENTS.md and all six context files. Implement feature 000 from
context/feature-specs/000-project-foundation.md only. Preserve this kit,
choose compatible supported dependencies, and establish a runnable local
foundation. Follow the common completion contract and update progress.
Do not implement authentication or scheduling yet.
```
