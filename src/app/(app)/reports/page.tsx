import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readLeaveRecovery } from "@/server/services/insights";
import { ChartBar, formatDate, formatPercent, InsightAccessDenied, InsightFilters } from "@/features/insights/components";
import type { InsightQuery } from "@/features/insights/filters";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<InsightQuery> }) {
  const actor = await requirePageSession();
  const { department, from, to } = await searchParams;
  let result;
  try { result = await readLeaveRecovery(actor.id, { department, from, to }); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <InsightAccessDenied description="Department reports are available to your coordinator, HoD and administrator." />;
  }

  const { data } = result;
  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata</p>
    <h1>Leave Recovery Report</h1>
    <p className="page-description">Published recovery and confirmed delivery for classes affected by approved leave.</p>
    {result.demo && <p className="insight-demo">Synthetic demo data</p>}
    <InsightFilters path="/reports" dates={[{ name: "from", value: result.from, label: "Start date" }, { name: "to", value: result.to, label: "End date" }]}
      refreshedAt={result.refreshedAt} error={result.error} />
    {data && <section className="schedule-panel mt-6" aria-labelledby="recovery-results">
      <h2 id="recovery-results" className="text-lg">Recovery outcomes</h2>
      <p className="mt-1 text-sm text-text-secondary">{formatDate(result.from)} – {formatDate(result.to)}</p>
      <dl className="insight-summary mt-4 tabular-nums">
        <div><dt>Affected obligations</dt><dd>{data.affected}</dd></div>
        <div><dt>Planned weekday recovery rate</dt><dd>{data.weekdayRate === null ? "Unavailable" : formatPercent(data.weekdayRate)}</dd>
          {!!data.affected && <dd className="insight-fraction">{data.categories[0].planned} of {data.affected} affected</dd>}
        </div>
        <div><dt>Delivered recoveries</dt><dd>{data.delivered}</dd></div>
      </dl>
      {data.affected === 0
        ? <p className="mt-4 text-sm">No obligations were affected by approved leave in this period.</p>
        : <>
          <figure className="mt-4">
            <figcaption className="text-sm font-medium">Obligations by recovery outcome</figcaption>
            <div aria-hidden="true" className="insight-chart-grid mt-2">
              {data.categories.map(category => <div key={category.label} className="insight-chart-card">
                <p className="mb-2 font-semibold">{category.label}</p>
                {category.label === "Unresolved"
                  ? <ChartBar label="Outstanding" value={category.planned} max={data.affected} variant="unresolved" />
                  : <>
                    <ChartBar label="Published" value={category.planned} max={data.affected} variant="planned" />
                    <ChartBar label="Delivered" value={category.delivered} max={data.affected} variant="delivered" />
                  </>}
              </div>)}
            </div>
          </figure>
          <div className="insight-table mt-4" role="region" aria-label="Leave recovery outcomes table" tabIndex={0}>
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">Published, delivered and unresolved obligations</caption>
              <thead><tr><th scope="col">Outcome</th><th scope="col">Obligations</th><th scope="col">Delivered</th></tr></thead>
              <tbody>{data.categories.map(category => <tr key={category.label}>
                <th scope="row">{category.label === "Unresolved" ? "Unresolved" : `Published ${category.label === "Saturday" ? "Saturday" : "weekday"}`}</th>
                <td>{category.planned}</td><td>{category.delivered}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
      <details className="mt-4 text-sm">
        <summary className="font-medium">How recovery is calculated</summary>
        <p className="mt-2">Planned weekday recovery rate = unique obligations with a published weekday recovery ÷ unique obligations affected by approved leave. Both dates are inclusive and filter the affected class date.</p>
        <p className="mt-2">An obligation counts once across replacement history, even when its recovery falls outside the period. A published recovery counts while active or confirmed Held. A missed recovery with no active replacement is unresolved.</p>
        <p className="mt-2">Delivered counts require a current Held record on the published recovery. The weekday rate describes published scheduling outcomes. Measuring Saturdays avoided would require a comparable baseline.</p>
      </details>
    </section>}
  </main>;
}
