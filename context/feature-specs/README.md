# Feature specifications and prompts

Each numbered file is both an implementation specification and a copyable agent prompt. Implementation status and actual verification are recorded in [progress](../progress.md). Shared context owns common rules; acceptance criteria below add feature-specific requirements.

## Build index

| ID | Specification | Scope |
| --- | --- | --- |
| 000 | [Project foundation](000-project-foundation.md) | MVP |
| 001 | [Authentication and roles](001-auth-and-roles.md) | MVP |
| 002 | [Master data](002-master-data.md) | MVP |
| 003 | [Timetable and conflicts](003-timetable-and-conflicts.md) | MVP |
| 004 | [Leave and impact preview](004-leave-and-impact-preview.md) | MVP |
| 005 | [Resolution engine](005-resolution-engine.md) | MVP |
| 006 | [Cover response and exceptions](006-cover-response-and-exceptions.md) | MVP |
| 007 | [Preview and publish](007-preview-and-publish.md) | MVP |
| 008 | [Delivery and ledger](008-delivery-and-ledger.md) | MVP |
| 009 | [Workload and reports](009-workload-and-reports.md) | MVP |
| 010 | [Notifications](010-notifications.md) | MVP |
| 011 | [Audit and demo verification](011-audit-and-demo-verification.md) | MVP |
| 012 | [Timetable generation](012-timetable-generation.md) | Optional |
| 013 | [CSV import and export](013-csv-import-export.md) | Optional |
| 014 | [Makeup voting](014-makeup-voting.md) | Optional |
| 015 | [Calendar feeds](015-calendar-feeds.md) | Optional |
| 016 | [What-if simulation](016-what-if-simulation.md) | Optional |
| 017 | [Emergency cover](017-emergency-cover.md) | Optional |

## Common completion contract

For every feature, follow [AGENTS.md](../../AGENTS.md). Read overview and progress, then all relevant shared context. Inspect actual code and verify dependencies. Implement only the requested scope. Tests must prove behaviour rather than copy implementation. Explain any inability to run checks and record unfinished acceptance criteria. Update progress and relevant shared facts after work. Do not proceed to another feature automatically.

All UI features inherit the SlotWise tokens, screen compositions, file-creation pattern, motion limits, responsive checks and accessibility rules in [ui-ux.md](../ui-ux.md). Read its “Creating future UI files” section before adding a page or component. The user's latest screenshot and the implemented charcoal/lime/lavender LPU UI supersede the earlier blue/flat reference. Reuse the actual shell and primitives rather than starting another template. The three external component catalogues remain optional sources, not mandatory installs. All mutations inherit permission, transaction and idempotency requirements from [architecture.md](../architecture.md) and [domain-rules.md](../domain-rules.md). Every protected feature needs a direct unauthorized-operation check, not only a hidden-button check.

## Prompt to implement a selected feature

```text
Read AGENTS.md and the context files it references.
Implement context/feature-specs/[chosen-file].md end to end.
For UI work, follow context/ui-ux.md's future-file pattern and reuse the
implemented LPU shell, shared controls and charcoal/lime/lavender styling.
Check its dependencies against existing code first. Follow the common
completion contract in context/feature-specs/README.md. Run relevant
checks, record actual results and update context/progress.md.
Explain the implemented flow and the React/Next.js concepts I should
understand for my viva. Stop after this feature.
```

## Prompt to review a completed feature

```text
Read AGENTS.md, the selected feature spec, and its related context.
Review the implementation against each acceptance criterion. Inspect
authorization, persistence, edge cases, and UI states. Run relevant
checks where available. Report concrete gaps with file references and
update progress to distinguish verified, unverified, and missing work.
Do not claim completion based only on screenshots or mocked data.
```

## Prompt to add a new feature specification

```text
Read AGENTS.md, context/overview.md and context/progress.md.
Feature requested: [describe the user outcome].
Inspect related context and code. Write the next numbered specification
under context/feature-specs/ using the existing format: goal, scope,
dependencies, flow, data/server operations, edge cases, numbered
Given/When/Then acceptance criteria, checks, demo and implementation prompt.
Keep cross-feature rules in their existing owning file. Mark assumptions
and distinguish MVP from optional work. Update the index and progress.
Do not implement application code in this step.
```
