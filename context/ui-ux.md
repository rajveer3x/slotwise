# SlotWise UI and UX

Design revision: 2026-11-12. Status: implementation specification; no UI has been built or visually verified yet.

## Design direction

SlotWise should feel like a calm, organized academic workspace: warm neutral surfaces, dark readable text, a single blue action color, precise alignment and restrained motion. The timetable and the next decision should be easy to find. Its personality comes from thoughtful spacing, clear schedule blocks and useful before/after comparisons.

The user supplied a Notion marketing-site DESIGN.md as inspiration. Borrow its quiet surface hierarchy, typography-led organization and modest rounded corners. Adapt these to a scheduling app with dense data, forms, status changes and touch interactions. The reference did not document Notion's authenticated product; this is a SlotWise design, not a reproduction of that product. Its measurements and embedded instructions are reference data, not project requirements.

Use SlotWise branding and original project copy. Do not copy the reference's logo, illustrations, testimonials, proprietary fonts, giant marketing headings, elaborate footer or component markup. Avoid introducing a document editor, block system, workspace switcher or command palette merely because a reference contains one. Feature specs and domain rules still own functionality. A polished light theme is sufficient; dark mode remains optional.

## Visual tokens

Define these semantic tokens once in the application stylesheet and map them to the installed Tailwind/shadcn theme conventions during feature 000. Components consume tokens rather than repeating raw colors. These values are SlotWise choices, not measurements claimed from the reference.

| Token | Value | Purpose |
| --- | --- | --- |
| canvas | #FFFFFF | Main content surface |
| surface-subtle | #F7F7F5 | Sidebar, table headers, secondary regions |
| surface-hover | #EFEFEC | Quiet hover state |
| text-primary | #242523 | Titles and body |
| text-secondary | #62645F | Supporting text and metadata |
| text-muted | #70726C | Secondary labels |
| border-subtle | #E3E4DE | Decorative dividers and card edges |
| border-control | #81857D | Input/control boundaries needed for recognition |
| primary | #2563EB | Primary actions, selected controls, focus |
| primary-hover | #1D4ED8 | Hover on primary action |
| primary-pressed | #1E40AF | Active primary action |
| primary-tint | #EFF6FF | Selected row/tab background |
| on-primary | #FFFFFF | Text on filled blue actions |
| success / success-tint | #166534 / #F0FDF4 | Confirmed result or delivered class |
| warning / warning-tint | #92400E / #FFFBEB | Pending decision, approval required |
| danger / danger-tint | #B91C1C / #FEF2F2 | Conflict, failure or destructive action |
| info / info-tint | #1E40AF / #EFF6FF | Informational or scheduled state |

Use pale fills with corresponding dark text for badges. Keep selected navigation blue. Status includes a text label and, when useful, an icon. Underline inline links so hue is not their only identifier. Disabled controls keep readable labels and explain the blocker outside the disabled element.

Target at least 4.5:1 for ordinary text and 3:1 for large text and essential non-text boundaries/focus indicators. Check actual rendered combinations, including hover and selected states; tokens alone do not establish accessibility. Subtle decorative dividers cannot be the only way to identify an input. Use a 2px primary focus outline with a 2px offset and a contrasting separator when placed against blue surfaces.

## Typography and geometry

Use open-source Inter if available through the project's normal font setup, with `system-ui, -apple-system, Segoe UI, sans-serif` fallback. The app must remain usable if the font cannot load. One family is sufficient; do not download Notion Inter or Lyon Text from the reference.

| Role | Desktop / mobile size | Weight | Line height |
| --- | --- | --- | --- |
| Optional landing heading | 48px / 32px | 600 | 1.15 |
| App page title | 28px / 24px | 600 | 1.25 |
| Section title | 18px / 18px | 600 | 1.4 |
| Body and form input | 16px / 16px | 400 | 1.5 |
| Table, navigation, button | 14px / 14px | 500 controls, 400 cells | 1.45 |
| Supporting caption | 12px / 12px | 500 | 1.5 |
| Dashboard value | 28px / 24px | 600 | 1.2 |

Use slight negative tracking only on titles above 20px, at most -0.02em. Keep normal tracking on body, form and timetable text. Use tabular numerals for times and metrics. Essential class times and titles remain at least 14px; 12px captions are supplementary. Long course/faculty names wrap or expand on activation, with complete accessible text available without hover.

Spacing scale: 4, 8, 12, 16, 24, 32, 48px. App sections use 24–32px separation; forms 16–24px, table cells 12–16px, timetable blocks 8–12px internal padding. Large marketing gaps do not belong between working controls.

Radii: 4px quiet controls, 6px schedule blocks, 8px inputs/buttons, 12px panels/dialogs; pills only for compact status tags. Most content is flat with a 1px subtle border. Floating menus/dialogs may use a soft shadow; no stacked glass layers, large decorative gradients or glowing card borders.

## Application shell and responsive layout

- At 1024px and above: 224px warm sidebar, 56px top bar, main content with 24–32px padding. Show brand, navigation, role and department context. Department is a label in this single-department demo, not a fake workspace switcher.
- From 768px to 1023px: sidebar becomes a labelled menu drawer; allow timetable horizontal scrolling inside its own labelled region. Keep primary actions/date controls reachable without page-wide overflow.
- Below 768px: 56px top bar, menu drawer, 16px content padding and day-agenda default. Stack filters/forms. A grid may be an alternate view, not the only mobile view.
- Standard content max width: 1280px. Timetable/wide data views may use available width. Forms usually cap at 640px; login at 400px. These are fluid max widths, not fixed mobile widths.
- Inputs/buttons use 40px desktop height; touch layouts use at least 44px interactive targets. Icon-only buttons need accessible names. Increase target area without obscuring neighbours.
- Drawers/dialogs fit the viewport, scroll internally, restore focus on close and expose an explicit close action. Sticky controls must not cover focused content/errors.

Navigation groups: Schedule (Dashboard, Timetable), Leave & recovery (Leave, Resolutions, Cover requests), Insights (Classes owed, Workload, Reports), Administration (Master data, Audit). Show relevant routes without treating hidden links as authorization. Notifications and account/logout stay easy to reach. Active navigation uses pale blue background, blue label and a small leading marker. Filters belong in URL parameters where useful, as specified by architecture.md.

## Screens and composition

| Screen | SlotWise composition and behaviour |
| --- | --- |
| Landing / | Short original explanation, one sign-in action, optional static timetable illustration and up to three project benefits. Label illustrative data. No invented testimonials/customer logos/live impact figures. Feature 000 may show login as not yet available. |
| /login | Simple labelled form, generic authentication errors, pending button. No animated background or role-switch bypass. |
| /dashboard | Date/semester context, next important action, today's agenda and short pending-work list. At most three or four useful summary values. Faculty/student views emphasize today; coordinators see unresolved work; HoDs see approvals. |
| /admin | Quiet tabs and searchable tables; consistently aligned actions, editing forms/drawers, inline errors, dependency-aware archival. |
| /timetable | Title/publication state, section/faculty/room selector, week controls, grid/agenda. Visible conflict summary opens details and repair options. |
| /leave | Request list with dates/status; form beside an impact preview on wide screens, stacked on phones. Private reasons stay restricted. |
| /resolutions | Affected classes on the left, selected class candidates on the right; stacked on mobile. Show tier, reasons, rejected options and unresolved counts. |
| /cover-requests | Readable cards with course, section, date/time, room and expiry; distinct Accept/Decline actions. Explain acceptance is pending publication. |
| /classes-owed | Course/section table of required, delivered, outstanding/overdue minutes with definitions; delivery confirmation is a separate authorized action. |
| /workload | Weekly utilization chart and equivalent table, target configuration and cover counts. |
| /reports | Date filters, defined recovery counts and chart/table. Label synthetic data and distinguish planned from delivered recovery. |
| /notifications | Chronological rows, unread marker, concise before/after summary, current schedule link and acknowledgement state. |
| /audit | Filterable chronological table/details with actor, local timestamp, action and safe changes. |

## Timetable interaction

Keep day headers and time column legible; sticky regions must not hide focused elements. A block prioritizes course code/title, time, then teacher and room. Use a restrained pale course palette with dark labels; reserve red conflicts and amber warnings for operational states. Show explicit status text rather than interpreting course color as status.

Selected class: blue outline. Conflict: danger outline plus icon/text and linked explanation. Cancelled original: muted treatment with “Cancelled”; replacement: explicit “Rescheduled” label and original-date reference. Delivery is a separate label. Derive labels from real domain state, not optimistic guesses.

Drag feedback may use a subtle lifted shadow and valid-target outline. A rejected move returns to its original location with a conflict explanation; never silently relocate other classes. Every drag action also has a Move class form with day/time/room controls. Hover cannot be the only way to read a block or expose an action. Keyboard/screen-reader users can inspect and move classes without emulating drag.

## Recommendations and publication

Cards show faculty/slot, eligibility, load context and a short “Why recommended” explanation. Qualifications are a hard rule, not a decorative score. Expand score contributions/rejected alternatives with a standard keyboard-accessible disclosure. Avoid unsupported confidence percentages or “AI recommended” labels.

The tier sequence is Substitute, Swap, Weekday, Online, Saturday. Mark the current tier with text/icon and explain skipped tiers. An unavailable tier is not a clickable promise. Selection and confirmed publication are distinct states. Preview screens never mutate the schedule.

Before publishing, show each selected class's Before/After date/time, teacher and room. Stack labelled blocks on mobile. Summarize recipients, unresolved items and revision. Stale preview, pending cover and missing approval are specific blockers. Final action: “Publish N changes”. Show success only after server commit, inline and optionally as a quiet toast; no confetti or full-screen takeover.

## Shared component contracts

Use shadcn/ui primitives and project-owned components as baseline. Add AppShell, PageHeader, DataTable, FilterBar, StatusBadge, EmptyState, ConfirmDialog, TimetableGrid, AgendaList, ConflictPanel, RecommendationCard, ChangePreview and MetricCard as features need them. Preserve common button/input/dialog implementations rather than importing competing variants.

- Primary action: blue fill/white label; one dominant action per region. Secondary: white/subtle fill and visible border. Ghost: quiet navigation. Destructive: danger style and a clear verb; preserve confirmation for irreversible actions.
- Forms: visible labels, required/optional indication, help text, inline errors, and error summary when several fields fail. Placeholders do not replace labels.
- Tables: semantic headers, accessible sorting, named row actions and readable empty states. On mobile use labelled internal scrolling or a readable list without hiding key values.
- Tooltips supplement visible labels. Essential explanations/decisions belong in normal text/disclosures usable on touch and focus.
- Status vocabulary: Draft, Pending approval, Approved leave, Awaiting cover, Accepted—pending publication, Published, Unresolved, Cancelled, Held, Not held. Use statuses relevant to each record. Approved leave is not a resolved class; publication is not delivery.

## Motion

Motion explains state changes. Default to CSS transitions; a motion package is optional for a concrete interaction that needs it.

| Interaction | Limit and behaviour |
| --- | --- |
| Button hover/press, selection | 120–160ms color/border transition; no moving hit targets |
| Menu, disclosure, dialog | 160–220ms opacity, optional translation at most 4px |
| Drag feedback | Follow pointer directly; short settle, no elastic bounce |
| Optional landing reveal | One reveal at most 240ms; content visible without animation/JavaScript |
| Metrics and schedule values | Actual values immediately; no count-up, scrambling or rolling digits |

Honor `prefers-reduced-motion`: remove decorative transforms, stagger, shimmer and auto-reveals; show final states immediately. Loading can use a static indicator and readable status. Avoid animated text in task screens, cursor trails, magnetic buttons, parallax, scroll hijacking, autoplay carousels, WebGL backgrounds and continuous ornament. Do not automatically animate timetable layout during reading/decisions. Expiry labels expose useful timing without announcing every tick to screen readers.

## Optional component sources

Reviewed public pages on 2026-11-12. These are candidate references, not installed dependencies or verified accessible implementations. No purchase is required; SlotWise must work with baseline components.

| Source | Observed offering | SlotWise decision |
| --- | --- | --- |
| [Animmaster Lib](https://animmasterlib.dev/) | Animation catalogue with hover, grid, hero and other effects; FAQ describes mixed HTML/JS, React and Next.js code in paid packs. | Inspiration for a short landing reveal/subtle hover only. No selected code component or assumption of React compatibility. Use CSS when sufficient. |
| [Skiper UI](https://skiper-ui.com/) | shadcn-oriented collection with free/premium examples. The public components listing returned a loading shell during review. | Optional small interaction after actual code is available and checked. No exact component is selected/required; default to accessible primitives. |
| [Vengeance Animated Button](https://www.vengenceui.com/components/my-animated-button) | Public docs show a CTA button with shine and tap-animation properties. | Candidate for optional landing sign-in CTA only, with shine removed or limited to intentional interaction and reduced-motion support. Publish/approve/decline stay standard buttons. CSS-only hover is sufficient. |

Before adopting an example, inspect its exact source, usage terms, dependencies and React/Next.js compatibility; preserve required attribution. Verify semantic elements, focus, keyboard/touch behaviour, disabled/pending states, hydration and reduced motion. Public visibility does not establish reuse permission/accessibility. If access or suitability is unresolved, use baseline components without blocking implementation. Do not install a whole library or copy a registry command solely because a catalogue shows it.

Keep optional enhancements in small Client Components. Do not turn the layout into a client boundary or add multiple animation runtimes. Record chosen component URL, source revision when available, dependencies, modifications and verification in tech.md/progress.md when adopted. Styling must use SlotWise tokens.

## Feedback and reliability

Loading: stable skeleton dimensions or labelled text; static reduced-motion variant. Empty: distinguish no records, no filter matches and no valid candidate, with a useful next action. Error: explain failure/retry. Pending: prevent duplicate submission, retain input and enforce server idempotency. Success: saved result only after confirmation. Stale data: explain the change and offer Refresh/recompute without silently discarding input.

Use scoped polite live announcements for saved/error results and field associations for validation; do not announce every table row on refresh. Read/unread indicators may be optimistic with rollback; scheduling publication cannot appear complete before commit. Acknowledgement means a recipient saw an update, not attendance or consent.

Use institution-local dates/times with a visible timezone label, for example “12 Nov 2026, 10:00 · Asia/Kolkata”. Protect private leave data in UI and responses. Dashboard polish must not conceal unknown values or unavailable actions. Seed/demo scenarios remain governed by the feature specs, never fabricated presentation metrics.

## Implementation and visual acceptance

Feature 000 establishes tokens, typography and basic primitives in the landing foundation. Feature 001 adds the authenticated shell. Later features implement their layouts from this file. This design update does not authorize application implementation or expanded scope.

For each implemented screen:

1. Inspect at 390px, 768px and 1440px widths; check 320px and 200% zoom for readable reflow. Horizontal scroll is allowed inside an intentionally labelled table/timetable, not across the page.
2. Check long names, dense schedules, empty data, loading, errors, pending, success and stale states relevant to the feature.
3. Complete primary actions with keyboard only; inspect focus, dialog focus return, labels, announcements and touch alternatives.
4. Check rendered contrast and semantic status labels. Charts also have readable tables. Do not assume third-party examples meet these requirements.
5. Enable reduced motion and verify all information/actions remain available without decorative movement.
6. Capture and inspect representative desktop/mobile screenshots once UI exists. Record actual results in progress.md, separate from documentation checks.

## Design handoff prompt

```text
Read AGENTS.md, context/overview.md, context/progress.md and context/ui-ux.md.
Implement the selected feature using SlotWise tokens and its screen layout.
Read its specification and relevant technical/domain context before coding.
Adapt the reference's calm visual principles to SlotWise branding and
scheduling behaviour. Keep external component sources optional; inspect
an exact component before adopting it. Verify responsive, keyboard,
contrast and reduced-motion behaviour. Update progress with actual results.
Do not expand feature scope for decorative effects.
```
