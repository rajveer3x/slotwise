# 003 Timetable editing and conflict repair

Scope: MVP. Dependencies: 002.

## Goal and flow

A coordinator builds a weekly draft, places allocations, sees precise conflicts, previews the result and publishes a clash-free version. Provide section, faculty and room views, desktop grid, mobile agenda, drag controls and a keyboard-accessible move form. Initial timetable publication is owned here; feature 007 extends the same transaction machinery to leave resolutions.

Apply [ui-ux.md](../ui-ux.md)'s timetable composition: legible day/time headers, pale course blocks with dark labels, distinct selection/conflict indicators and a mobile agenda. Use the explicit Move class form as the keyboard/touch alternative. Keep hover effects supplemental and timetable values stable during reading.

## UI alignment

Use the implemented charcoal LPU AppShell, pale workspace and rounded white filter/editor panels. Course blocks use restrained lavender, lime and peach treatments; conflicts keep semantic danger styling, while draft, published, cancelled and delivery states remain explicit text. Reuse existing grid/agenda components, shared buttons and the labelled Move class form. Publication previews use readable Before/After details with a clearly pending final action.

Read [ui-ux.md](../ui-ux.md)'s “Creating future UI files” section before changing this implemented feature. Preserve drag/drop, keyboard moves, contained grid scrolling, conflict explanations and transaction behaviour. For browser drag checks with taller cards, position the destination before starting a native drag so the test does not scroll the page mid-drag.

## Data and operations

Implement timetable versions/entries, stable obligations, dated occurrences and resource reservations. Pure functions validate intervals, capacities, qualification, availability, labs and limits. Suggest up to three valid alternative placements for a rejected move; suggestions never move other classes automatically. Draft conflict warnings may be stored, but invalid drafts cannot publish.

On publish, materialize dated occurrences for the effective semester range excluding holidays, reserve resources atomically and record audit events and a minimal in-app notification schema. Use revision and idempotency protection from architecture.md. Preserve past/delivered records and reject overwriting future resolved occurrences. Reuse this service in later features.

## Acceptance criteria

1. Given a faculty, section or room overlap, when moving a class, then the specific conflict is shown and it cannot enter a published schedule.
2. Given consecutive classes ending/starting at the same instant, when validated, then they do not conflict.
3. Given a lab requiring consecutive slots, when placed into an unsuitable room or split interval, then validation rejects it.
4. Given a valid weekly draft and holiday calendar, when published twice with the same request key, then only one set of obligations and occurrences exists.
5. Given two competing publications, when both attempt the same resource interval, then at most one commits and the other receives a conflict/stale result.
6. Given an existing delivered occurrence, when a future timetable revision publishes, then the historical record and its obligation identity are preserved.

## Checks and demo

Unit-test boundary intervals and constraints. Use actual PostgreSQL integration tests for overlap, concurrent writes and rollback. Browser-test drag and keyboard move, invalid publication and mobile agenda. Demonstrate one conflict repaired using a suggested alternative.

## Implementation prompt

```text
Read AGENTS.md and scheduling context. Implement
context/feature-specs/003-timetable-and-conflicts.md. Read context/ui-ux.md
and reuse the existing LPU shell, pastel timetable and shared controls.
Inspect and preserve implemented workflows. Build or maintain manual editing,
conflict explanations, alternatives and safe initial publication. Do not
add auto-generation. Follow the common completion contract and update progress.
```
