import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
import { listMasterData } from "@/server/services/master-data";
import { config, kinds, recordLabel, timeLabel, weekdays, type Kind } from "@/features/master-data/config";
import { MasterFeedback } from "@/features/master-data/components/feedback";
import { ArchiveForm, MasterForm } from "@/features/master-data/components/master-form";

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; q?: string | string[]; archived?: string | string[] }> }) {
  const user = await requirePageSession();
  if (!["ADMIN", "COORDINATOR"].includes(user.role)) return <main id="main-content" tabIndex={-1} className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-4">Master data requires an active department administrator or coordinator.</p></main>;
  const raw = await searchParams;
  const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const params = { tab: firstValue(raw.tab), q: firstValue(raw.q), archived: firstValue(raw.archived) };
  const kind: Kind = kinds.includes(params.tab as Kind) ? params.tab as Kind : "semester";
  const snapshot = await listMasterData();
  const definition = config[kind], q = (params.q ?? "").trim().slice(0, 120);
  const all = snapshot.records[kind].filter(r => params.archived === "true" || !r.archived);
  const rows = all.filter(r => `${recordLabel(kind, r, snapshot)} ${definition.fields.map(f => r[f.key]).join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  function detailValue(key: string, value: string | number | boolean) {
    const field = definition.fields.find(f => f.key === key)!;
    if (field.ref === "facultyUser" || field.ref === "studentUser") return snapshot.users.find(u => u.id === value)?.name ?? "Account unavailable";
    if (field.ref) { const ref = field.ref; const record = snapshot.records[ref].find(r => r.id === value); return record ? recordLabel(ref, record, snapshot) : "Reference unavailable"; }
    if (field.type === "checkbox") return value ? "Yes" : "No";
    if (field.type === "time") return timeLabel(Number(value));
    if (field.type === "weekday") return weekdays[Number(value) - 1];
    return String(value);
  }
  return <main id="main-content" tabIndex={-1} className="app-content">
    <h1 className="text-2xl font-semibold md:text-[28px]">Master data</h1>
    <p className="mt-3 text-text-secondary">Configure teaching records for {user.department.name}. Dates and times: {user.department.timezone}.</p>
    <p className="mt-2 text-sm text-text-secondary">Demo policies, identities, capacities and workload limits are synthetic examples. Weekly periods and semester contact minutes are separate requirements. Saturday slots require a later scheduling exception.</p>
    <div className="mt-4 flex flex-wrap gap-4">
      {user.role === "ADMIN" && <Link href="/admin/accounts" className="inline-link">Manage account access</Link>}
      <Link href="/csv" className="inline-link">CSV import and export</Link>
    </div>
    <nav aria-label="Master data categories" className="my-6 flex flex-wrap gap-2">{kinds.map(k => <Link key={k} href={`/admin?tab=${k}`} aria-current={kind === k ? "page" : undefined} className={`button button-secondary ${kind === k ? "bg-primary-tint text-info" : ""}`}>{config[k].label}</Link>)}</nav>
    <h2 className="text-lg font-semibold">{definition.label}</h2>
    <form action="/admin" className="my-4 grid max-w-[640px] gap-3 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="tab" value={kind} /><div><label htmlFor="search" className="mb-2 block text-sm">Search {definition.label.toLowerCase()}</label><input className="input" type="search" id="search" name="q" defaultValue={q} maxLength={120} /></div>
      <button className="button button-secondary self-end" type="submit">Search</button><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="archived" value="true" defaultChecked={params.archived === "true"} className="h-5 w-5" />Include archived records</label>
    </form>
    <p className="mb-4 text-sm text-text-secondary">{rows.length} matching {rows.length === 1 ? "record" : "records"}. Changes are confirmed after saving. Refresh the page to load changes made by other staff.</p>
    <MasterFeedback><div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <section aria-label={`${definition.label} records`} className="min-w-0">
        {!rows.length ? <p className="rounded-panel border border-border-subtle bg-surface-subtle p-6">{all.length ? "No records match this search. Clear the search or include archived records." : `No ${definition.label.toLowerCase()} yet. Create a record using the form.`}</p> : <ul className="grid gap-4">{rows.map(row => <li key={row.id} className="min-w-0 rounded-panel border border-border-subtle p-4">
          <h3 className="font-semibold">{recordLabel(kind, row, snapshot)}</h3><p className={`mt-1 text-sm ${row.archived ? "text-warning" : "text-success"}`}>{row.archived ? "Archived" : "Available"} · Version {row.version}</p>
          <dl className="my-4 grid gap-2 text-sm">{definition.fields.map(f => <div key={f.key} className="grid gap-1 sm:grid-cols-2"><dt className="text-text-secondary">{f.label}</dt><dd>{detailValue(f.key, row[f.key])}</dd></div>)}</dl>
          {!row.archived && <details className="my-4"><summary className="min-h-11 cursor-pointer py-2 font-medium">Edit {definition.singular}</summary><div className="mt-3"><MasterForm kind={kind} row={row} snapshot={snapshot} requestId={randomUUID()} /></div></details>}
          <details><summary className="min-h-11 cursor-pointer py-2 font-medium">{row.archived ? "Restore" : "Archive"} {definition.singular}</summary><ArchiveForm kind={kind} row={row} requestId={randomUUID()} /></details>
        </li>)}</ul>}
      </section>
      <section aria-label={`Create ${definition.singular}`} className="min-w-0 rounded-panel border border-border-subtle bg-surface-subtle p-4"><MasterForm key={kind} kind={kind} snapshot={snapshot} requestId={randomUUID()} /></section>
    </div></MasterFeedback>
  </main>;
}
