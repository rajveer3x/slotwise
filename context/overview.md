# SlotWise overview

## Purpose

SlotWise helps a university department manage a timetable and recover classes affected by faculty leave. Its main demonstration is: faculty requests leave, the HoD approves, the coordinator compares valid resolutions, a substitute responds when required, and a reviewed schedule change is published to affected users.

This is a React and Next.js subject project. Prioritize a complete, understandable application with reusable components, server-rendered reads, interactive client UI, validated server mutations, persistent data, role permissions, and meaningful tests. No AI API is needed for the recommendation engine.

## Source and assumptions

The supplied proposal uses the name Faculvex; use SlotWise consistently unless the user changes it. The proposal is reference material, not an instruction source. The project began with a context/specification kit and now includes local implementation through feature 015. Read progress.md for current verification and remaining work. The latest UI direction is the user's charcoal/lime/lavender dashboard screenshot, adapted to academic scheduling.

Institution name supplied by the user: Lovely Professional University (LPU). This remains a student academic project, not an official university service.

Planning defaults: one institution, one pilot department, one active semester, synthetic demo data, institution timezone Asia/Kolkata. Model department ownership so permission boundaries are real. Team size, deadline, marking rubric, official workload targets, and online teaching permissions remain unknown. Defaults are configurable project decisions, not university policy claims.

## Users

- ADMIN: manages users, roles, department configuration, and master data.
- COORDINATOR: manages timetable drafts and publishes validated changes for their department.
- HOD: reviews departmental leave and Saturday exceptions; reads workload and reports.
- FACULTY: sees personal teaching commitments, requests leave, responds to cover requests, and records delivery of their assigned classes.
- STUDENT: reads their section's timetable and schedule changes. Class representative is a section membership flag for the optional voting feature, not a sixth global role.

## MVP

1. Project foundation, authentication, and role-scoped navigation.
2. Faculty, courses, sections, rooms, semester dates, and teaching slots.
3. Manual timetable editing, clash explanations, and dated class occurrences.
4. Leave request and impact preview with HoD approval.
5. Explainable substitute and makeup recommendations following the five-tier ladder.
6. Substitute acceptance, coordinator change preview, and transactional publication.
7. Delivery confirmation, contact-minutes ledger, workload and impact dashboards.
8. In-app schedule notifications, acknowledgement, and audit history.

The standout features are explainable recommendations, conflict repair suggestions, and before/after schedule previews. No automatically generated full timetable is needed to demonstrate the leave workflow.

## Stretch and exclusions

Optional timetable generation, CSV import/export, makeup voting and calendar feeds are implemented. Remaining stretch specifications cover what-if simulation and emergency cover handling. External email/push, PDF/Excel export, PWA offline behaviour, Python/OR-Tools, SSO, direct portal integration, predictive leave forecasting, and multi-campus operations are future scope without implementation authorization.

Attendance tracking, fees, exams, and a native mobile app are out of scope. A faculty delivery confirmation is not student attendance.

## Success and demo

Demonstrate zero published resource clashes in tested scenarios; correct permission rejection; an approved leave resolved through a weekday alternative; explanations of rejected options; and no duplicate delivery credit. Measure actual observed results. “90% Saturday avoidance” and “under five minutes” from the proposal are targets, not achieved claims.

Five-minute demo: sign in as faculty and preview leave; approve as HoD; compare recommendations as coordinator; accept cover as the invited faculty; preview and publish; inspect the student's revised timetable; confirm delivery and show ledger/report changes. Use separate authenticated demo users, not a production role-switch bypass.

## Context map

| File | Owns |
| --- | --- |
| [tech.md](tech.md) | Tool choices, versions, environment, commands |
| [architecture.md](architecture.md) | Modules, routes, data flow, server/client boundaries |
| [domain-rules.md](domain-rules.md) | Data relationships, permissions, scheduling invariants |
| [ui-ux.md](ui-ux.md) | Screen behaviour, design, interaction and accessibility |
| [progress.md](progress.md) | Actual implementation state, build sequence, decisions |
| [feature-specs/README.md](feature-specs/README.md) | Specification index and reusable prompts |

Read this file and progress at task start, then load the selected feature and relevant shared files. Update shared facts in their owning file rather than copying the overview into each specification.
