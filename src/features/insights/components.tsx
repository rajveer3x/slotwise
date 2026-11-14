import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const percentFormat = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 2 });

export const formatPercent = (ratio: number) => percentFormat.format(ratio);
export const formatDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

export function InsightAccessDenied({ description }: { description: string }) {
  return <main id="main-content" tabIndex={-1} className="app-content">
    <h1>Access denied</h1><p>{description}</p>
  </main>;
}

type DateField = { name: string; label: string; value: string };
export function InsightFilters({ path, dates, refreshedAt, error }: {
  path: string; dates: DateField[]; refreshedAt: string; error?: string;
}) {
  return <section className="schedule-panel mt-6" aria-labelledby="report-period">
    <h2 id="report-period" className="text-lg">Reporting period</h2>
    <form action={path} method="get" aria-labelledby="report-period" className="insight-filters mt-3">
      {dates.map(date => <div key={date.name} className="min-w-0">
        <label htmlFor={date.name} className="mb-1 block text-sm font-medium">{date.label}</label>
        <Input id={date.name} name={date.name} type="date" defaultValue={date.value} required
          aria-invalid={error ? true : undefined} aria-describedby={error ? "period-error" : undefined} />
      </div>)}
      <Button type="submit">Apply dates</Button>
    </form>
    {error
      ? <p id="period-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>
      : <p className="mt-3 text-sm text-text-secondary">Updated <time dateTime={refreshedAt}>{timeFormat.format(new Date(refreshedAt))}</time> · Apply dates again to refresh these results.</p>}
  </section>;
}

export function ChartBar({ label, value, max, variant, suffix = "" }: {
  label: string; value: number; max: number; variant: "planned" | "delivered" | "target" | "unresolved"; suffix?: string;
}) {
  return <div className="insight-bar-row">
    <span>{label}</span>
    <span className="insight-bar-track"><span className={`insight-bar-fill insight-bar-${variant}`} style={{ width: `${value / max * 100}%` }} /></span>
    <span className="text-right tabular-nums">{value}{suffix}</span>
  </div>;
}
