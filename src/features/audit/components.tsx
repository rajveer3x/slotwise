import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockTime } from "@/domain/scheduling/timetable";
import type { readAudit, SafeValue } from "@/server/services/audit";

type Results = Awaited<ReturnType<typeof readAudit>>;
type Event = Results["rows"][number];

const timestamp = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium",
});
const weekdays = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function label(key: string) {
  return key.replace(/Ids?$/, match => match === "Id" ? " ID" : " IDs")
    .replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

function AuditFields({ fields }: { fields: Record<string, SafeValue> }) {
  if (!Object.keys(fields).length) return <p className="text-sm text-text-secondary">No details recorded.</p>;
  return <dl className="grid gap-2 text-sm">{Object.entries(fields).map(([key, value]) =>
    <div key={key} className="min-w-0">
      <dt className="font-medium">{label(key)}</dt>
      <dd className="wrap-anywhere">
        <AuditValue field={key} value={value} />
      </dd>
    </div>)}</dl>;
}

function AuditValue({ field, value }: { field: string; value: SafeValue }) {
  if (value === null) return field === "roomId" ? "Online" : "None";
  if (Array.isArray(value)) {
    return value.length ? <ol className="mt-1 grid gap-2">{value.map((item, index) =>
      <li key={index} className="border-l-2 border-lavender pl-2"><AuditValue field={field} value={item} /></li>)}</ol> : "None";
  }
  if (typeof value === "object") return <AuditFields fields={value} />;
  if (typeof value === "number" && (field === "startMinute" || field === "endMinute")) return clockTime(value);
  if (typeof value === "number" && field === "weekday") return weekdays[value];
  if (typeof value === "string" && (field === "status" || field === "schedulingStatus")) return label(value.toLowerCase().replaceAll("_", " "));
  return value;
}

function AuditTime({ value }: { value: string }) {
  return <time dateTime={value}>{timestamp.format(new Date(value))}</time>;
}

export function AuditWorkspace({ result, actions }: { result: Results; actions: { value: string; label: string }[] }) {
  const { filters, error, actors, rows, detail, total, page, pages } = result;
  function href(targetPage: number, event?: string) {
    const query = new URLSearchParams();
    for (const key of ["actor", "action", "entity", "from", "to"] as const) {
      const value = filters[key];
      if (value) query.set(key, value);
    }
    if (targetPage > 1) query.set("page", String(targetPage));
    if (event) query.set("event", event);
    return query.size ? `/audit?${query}` : "/audit";
  }

  return <>
    <section aria-labelledby="audit-filters" className="schedule-panel mt-6">
      <h2 id="audit-filters" className="text-lg">Filter events</h2>
      <form method="get" action="/audit" aria-labelledby="audit-filters" className="mt-4">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          <div className="grid min-w-0 gap-1 text-sm font-medium">
            <label htmlFor="audit-actor">Actor</label>
            <select id="audit-actor" className="input w-full min-w-0" name="actor" defaultValue={filters.actor ?? ""}>
              <option value="">All actors</option>
              {actors.map(actor => <option key={actor.id} value={actor.id}>{actor.name} · {actor.id}</option>)}
            </select>
          </div>
          <div className="grid min-w-0 gap-1 text-sm font-medium">
            <label htmlFor="audit-action">Action</label>
            <select id="audit-action" className="input w-full min-w-0" name="action" defaultValue={filters.action ?? ""}>
              <option value="">All actions</option>
              {actions.map(action => <option key={action.value} value={action.value}>{action.label}</option>)}
            </select>
          </div>
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            Entity ID
            <Input name="entity" maxLength={100} defaultValue={filters.entity ?? ""} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            Start date
            <Input name="from" type="date" defaultValue={filters.from ?? ""} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium">
            End date
            <Input name="to" type="date" defaultValue={filters.to ?? ""} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button type="submit">Apply filters</Button>
          <Link href="/audit" className="inline-link">Clear filters</Link>
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </section>

    {detail && <section id="event-details" className="schedule-panel mt-6" aria-labelledby="audit-detail">
      <h2 id="audit-detail" className="text-lg">{detail.action}</h2>
      <p className="mt-2 wrap-anywhere">{detail.actor} · <AuditTime value={detail.createdAt} /></p>
      <p className="mt-1 text-sm wrap-anywhere text-text-secondary">Entity ID {detail.entityId}</p>
      {typeof detail.after.reason === "string" && <p className="mt-3 text-sm wrap-anywhere"><strong>Reason</strong> · {detail.after.reason}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <AuditSnapshot title="Before" fields={detail.before} />
        <AuditSnapshot title="After" fields={detail.after} />
      </div>
      <Link href={href(page)} className="inline-link mt-4 inline-block">Close event details</Link>
    </section>}

    <section className="schedule-panel mt-6" aria-labelledby="audit-results">
      <h2 id="audit-results" className="text-lg">Events</h2>
      {rows.length ? <>
        <p className="mt-2 text-sm text-text-secondary">{total} {total === 1 ? "event" : "events"} · Page {page} of {pages}</p>
        <div className="insight-table mt-4" role="region" aria-label="Audit events table" tabIndex={0}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Department audit events, newest first</caption>
            <thead><tr>{["Timestamp", "Action", "Actor", "Entity ID"].map(title =>
              <th key={title} scope="col" className="p-3">{title}</th>)}</tr></thead>
            <tbody>{rows.map(row => <AuditRow key={row.id} row={row} href={`${href(page, row.id)}#event-details`} />)}</tbody>
          </table>
        </div>
        {pages > 1 && <nav aria-label="Audit pages" className="mt-4 flex flex-wrap gap-4">
          {page > 1 && <Link className="inline-link" href={href(page - 1)}>Previous page</Link>}
          {page < pages && <Link className="inline-link" href={href(page + 1)}>Next page</Link>}
        </nav>}
      </> : <p className="mt-2 text-sm text-text-secondary">{error ? "Apply valid filters to see events." :
        filters.actor || filters.action || filters.entity || filters.from || filters.to
          ? "No audit events match these filters." : "No audit events have been recorded for your department yet."}</p>}
    </section>
  </>;
}

function AuditSnapshot({ title, fields }: { title: string; fields: Record<string, SafeValue> }) {
  const change = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "reason"));
  return <div className="min-w-0 rounded-2xl border border-border-subtle p-3">
    <h3 className="mb-2 font-semibold">{title}</h3>
    <AuditFields fields={change} />
  </div>;
}

function AuditRow({ row, href }: { row: Event; href: string }) {
  return <tr>
    <td className="p-3"><AuditTime value={row.createdAt} /></td>
    <th scope="row" className="p-3 font-medium"><Link href={href} className="inline-link">{row.action}</Link></th>
    <td className="p-3"><div className="max-w-48 whitespace-normal wrap-anywhere">{row.actor}</div></td>
    <td className="p-3">{row.entityId}</td>
  </tr>;
}
