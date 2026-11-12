# 013 CSV import and export

Scope: optional; implement only when selected. Dependencies: 002 and 003.

## Goal and flow

Authorized staff download a template, upload UTF-8 CSV, preview row-level validation, and commit validated master data or a timetable draft. Export scoped timetable rows. Excel workbooks, PDF and direct portal integration remain future scope.

## Operations and boundaries

Use a maintained CSV parser instead of splitting on commas. Provide documented headers and examples for faculty, courses, rooms and draft timetable entries. Resolve references by scoped unique codes; no user roles/passwords via this importer. Bound file size/row count. Show row number and column for errors. MVP commit is all-or-nothing for the validated file; revalidate uniqueness, references and current revision at commit. Imports cannot publish directly or overwrite delivered history. Export only authorized fields and neutralize formula-leading cells for spreadsheet consumers.

## Acceptance criteria

1. Given a valid CSV with quoted commas/newlines, when previewed, then fields are parsed correctly with no writes.
2. Given one invalid row or unknown reference, then commit is disabled/rejected and errors identify the row and field.
3. Given data changed after preview, then commit revalidates and does not silently duplicate or overwrite records.
4. Given formula-leading content or another department's IDs, then export neutralization and scope checks apply.

## Checks and demo

Test quoting, encodings, size limits, malformed headers, duplicates, rollback and formula injection. Demo invalid preview followed by corrected import and scoped export.

## Implementation prompt

```text
Read AGENTS.md and relevant context. I am selecting optional feature 013.
Implement context/feature-specs/013-csv-import-export.md with preview,
row errors and atomic commit. Follow the common completion contract and
update progress. Do not add Excel or PDF export.
```
