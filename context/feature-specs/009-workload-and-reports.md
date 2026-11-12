# 009 Workload and impact dashboards

Scope: MVP. Dependencies: 008.

## Goal and flow

HoD/coordinator chooses a week or reporting period and sees faculty planned teaching minutes against configured targets, delivered minutes and confirmed covers. An impact report shows weekday recovery, Saturday resolutions, unresolved obligations and actual delivered recovery from leave cases.

Use [ui-ux.md](../ui-ux.md)'s restrained metric hierarchy and semantic status palette. Display actual values immediately with tabular numerals and an equivalent readable table; avoid count-up animations or effects that obscure changing data.

## Data and operations

Use authorized aggregate queries and pure metric functions. Follow the normalized utilization and denominator definitions in domain-rules.md. Show a table alongside charts, formulas in help text, sample sizes and period filters. A faculty member can see their own workload but not private staff-wide details. Missing or zero targets produce “target not configured”, never division by zero or misleading balance labels.

The report title should be “Leave Recovery Report” until a real comparable baseline exists. Do not claim “Saturdays avoided” just because a weekday resolution was published. Use synthetic-data labels for demo fixtures. Advanced workload rebalancing and weighted administrative duties are deferred.

## Acceptance criteria

1. Given different faculty targets, when displaying utilization, then each faculty uses their own applicable target and substitution minutes are counted once.
2. Given no target or no data, then the dashboard shows an explicit unavailable/empty state rather than fabricated zero-quality metrics.
3. Given five affected obligations with two published weekday recoveries, one Saturday and two unresolved, then the planned weekday recovery rate is 2/5 and all categories are visible.
4. Given a published but undelivered makeup, then planned and delivered recovery counts differ correctly.
5. Given a department filter or direct query for another department, then unauthorized data is excluded/rejected.

## Checks and demo

Test numerator/denominator fixtures, zero denominators, date boundaries, scoped queries and rescheduled duplicates. Verify chart/table agreement, keyboard filters and narrow-screen layouts. Explain the formula and limitations during the demo.

## Implementation prompt

```text
Read AGENTS.md and metric definitions. Implement
context/feature-specs/009-workload-and-reports.md using real aggregates,
accessible tables and charts. Label demo data and planned versus delivered
results. Follow the common completion contract and update progress.
```
