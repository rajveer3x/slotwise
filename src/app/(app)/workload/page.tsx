import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readWorkload } from "@/server/services/insights";
import { ChartBar, formatDate, formatPercent, InsightAccessDenied, InsightFilters } from "@/features/insights/components";
import type { InsightQuery } from "@/features/insights/filters";

export default async function WorkloadPage({ searchParams }: { searchParams: Promise<InsightQuery> }) {
  const actor = await requirePageSession();
  const { department, week } = await searchParams;
  let result;
  try { result = await readWorkload(actor.id, { department, week }); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <InsightAccessDenied description="Workload is available to faculty and authorized staff in their own department." />;
  }

  const { data } = result;
  const rows = data?.rows ?? [];
  const hasClasses = !!(data?.plannedClasses || data?.deliveredClasses);
  const scale = rows.reduce((max, row) => Math.max(max, row.plannedMinutes, row.deliveredMinutes, row.targetMinutesPerWeek ?? 0), 1);
  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata</p>
    <h1>{actor.role === "FACULTY" ? "My teaching workload" : "Faculty workload"}</h1>
    <p className="page-description">Compare planned and delivered teaching with the configured weekly target.</p>
    {result.demo && <p className="insight-demo">Synthetic demo data</p>}
    <InsightFilters path="/workload" dates={[{ name: "week", value: result.selectedDate, label: "Date in teaching week" }]}
      refreshedAt={result.refreshedAt} error={result.error} />
    {data && <section className="schedule-panel mt-6" aria-labelledby="workload-results">
      <h2 id="workload-results" className="text-lg">Weekly teaching minutes</h2>
      <p className="mt-1 text-sm text-text-secondary">{formatDate(result.start)} – {formatDate(result.end)}</p>
      {hasClasses
        ? <p className="mt-2 text-sm tabular-nums">{rows.length} faculty · {data.plannedClasses} planned classes · {data.deliveredClasses} confirmed held</p>
        : <p className="mt-3 text-sm">{rows.length ? "No planned or delivered classes in this week. Utilization is unavailable for this period." :
          data.own ? "Your account has no active faculty profile." : "No faculty profiles or teaching records are available for this week."}</p>}
      {hasClasses && <figure className="mt-4">
        <figcaption className="text-sm font-medium">Weekly minutes by faculty</figcaption>
        <div aria-hidden="true" className="insight-chart-grid mt-2">
          {rows.map(row => <div key={row.id} className="insight-chart-card">
            <p className="mb-2 font-semibold [overflow-wrap:anywhere]">{row.name}</p>
            <ChartBar label="Planned" value={row.plannedMinutes} max={scale} variant="planned" suffix=" min" />
            <ChartBar label="Delivered" value={row.deliveredMinutes} max={scale} variant="delivered" suffix=" min" />
            {!row.targetMinutesPerWeek || row.targetMinutesPerWeek < 0
              ? <p className="mt-1 text-sm text-text-secondary">Target not configured</p>
              : <ChartBar label="Target" value={row.targetMinutesPerWeek} max={scale} variant="target" suffix=" min" />}
          </div>)}
        </div>
      </figure>}
      {rows.length > 0 && <div className="insight-table mt-4" role="region" aria-label="Faculty workload table" tabIndex={0}>
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Weekly planned, delivered and target minutes, utilization and confirmed covers</caption>
          <thead><tr>
            <th scope="col">Faculty</th><th scope="col">Planned (min)</th><th scope="col">Delivered (min)</th>
            <th scope="col">Target (min)</th><th scope="col">Planned utilization</th><th scope="col">Confirmed covers</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row" className="[overflow-wrap:anywhere]">{row.name}</th>
            <td>{hasClasses ? row.plannedMinutes : "—"}</td>
            <td>{hasClasses ? row.deliveredMinutes : "—"}</td>
            <td>{row.utilization === null ? "Target not configured" : row.targetMinutesPerWeek}</td>
            <td>{row.utilization === null || !hasClasses ? "Unavailable" : `${formatPercent(row.utilization)} · ${row.band}`}</td>
            <td>{hasClasses ? row.confirmedCovers : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <details className="mt-4 text-sm">
        <summary className="font-medium">How workload is calculated</summary>
        <p className="mt-2">Planned utilization = active published teaching minutes ÷ the faculty member’s current weekly target. Weeks run Monday through Sunday. The full target applies each week, including weeks with holidays.</p>
        <p className="mt-2">Planned minutes include published substitute assignments once, for the assigned teacher. Delivered minutes use current Held confirmations, grouped by class date. Confirmed covers count Held substitute classes.</p>
        <p className="mt-2">Demo bands are under target below 90%, balanced from 90% through 110%, and over target above 110%.</p>
      </details>
    </section>}
  </main>;
}
