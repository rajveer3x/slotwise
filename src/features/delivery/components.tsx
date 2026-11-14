"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeliveryWorkspace } from "@/server/services/delivery";
import type { DeliveryResult } from "./schema";
import { deliveryAction } from "./actions";
const outcome = (s: string) => s === "HELD" ? "Held" : s === "NOT_HELD" ? "Not held" : "Pending";
export const deliveryTime = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export function DeliveryView({ workspace: w, ledger = false }: { workspace: DeliveryWorkspace; ledger?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<DeliveryResult>();
  return <>
    <form method="get" className="schedule-panel my-6 grid gap-3 sm:grid-cols-[1fr_auto]" aria-label="Semester filter"><div><label htmlFor="delivery-semester" className="mb-2 block">Semester</label><select className="input" id="delivery-semester" name="semester" defaultValue={w.semesterId ?? ""}>{!w.semesters.length && <option value="">No semesters available</option>}{w.semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><Button className="self-end" type="submit" variant="secondary" disabled={!w.semesters.length}>Apply semester</Button></form>
    <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Refreshing…" : "Refresh current status"}</Button><p className="mt-2 text-sm text-text-secondary">Snapshot: {deliveryTime(w.now)} · Asia/Kolkata. Refresh detects changed delivery; correction input is retained for review.</p>
    <p role="status" className={`mt-3 ${feedback?.ok ? "text-success" : "text-danger"}`}>{feedback?.message}</p>
    {ledger ? <section className="schedule-panel mt-6" aria-labelledby="ledger-heading"><h2 id="ledger-heading" className="text-lg font-semibold">Contact-minutes ledger</h2><p className="mt-3 text-sm">Required is the semester allocation target. Delivered counts each obligation once, including replacements. Outstanding = required − delivered, floored at zero. Overdue starts at the earliest scheduled end in an obligation’s history and remains until delivery. Future planned coverage is outstanding; it earns no credit. Targets may include requirements not yet materialized into classes. Scroll the table horizontally on smaller screens to read every metric.</p>{w.ledger.length ? <div role="region" aria-label="Course and section ledger" tabIndex={0} className="mt-4 overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm"><caption className="sr-only">Semester contact minutes by course and section</caption><thead><tr>{["Course / section", "Required", "Delivered", "Future planned", "Outstanding", "Overdue"].map(h => <th key={h} scope="col" className="whitespace-nowrap border-b border-border-subtle p-3">{h}</th>)}</tr></thead><tbody>{w.ledger.map(r => <tr key={r.id}><th scope="row" className="min-w-48 border-b border-border-subtle p-3 font-medium">{r.course}<span className="mt-1 block text-text-secondary">{r.section}</span></th>{[r.required, r.delivered, r.planned, r.outstanding, r.overdue].map((v, i) => <td key={i} className={`whitespace-nowrap border-b border-border-subtle p-3 ${i === 4 && v ? "text-warning" : ""}`}>{v} min</td>)}</tr>)}</tbody></table></div> : <p className="mt-4">No course allocations in this semester. Configure allocations before tracking requirements.</p>}<Link className="inline-link mt-4 inline-block" href={`/delivery${w.semesterId ? `?semester=${encodeURIComponent(w.semesterId)}` : ""}`}>Open class delivery</Link></section> : <section className="mt-6" aria-labelledby="delivery-heading"><h2 id="delivery-heading" className="text-lg font-semibold">Class delivery</h2><p className="mt-2">Confirm the full scheduled duration after a class ends. This is a teaching confirmation, not student attendance. Coordinators must give an audit reason when confirming or correcting an outcome.</p>{w.classes.length ? <ul className="mt-4 grid gap-4">{w.classes.map(c => <li key={c.id} className="schedule-panel"><h3 className="font-semibold">{c.course} · {c.section}</h3><p className="mt-2">{deliveryTime(c.startAt)} – {deliveryTime(c.endAt)} · {c.minutes} min</p><p className="mt-1 text-sm">{c.faculty} · Schedule: {c.schedulingStatus === "ACTIVE" ? "Active" : "Cancelled"} · Delivery: <strong className={c.deliveryStatus === "HELD" ? "text-success" : c.deliveryStatus === "NOT_HELD" ? "text-warning" : ""}>{outcome(c.deliveryStatus)}</strong></p>{(c.canConfirm || c.canCorrect) && <DeliveryForm record={c} coordinator={w.coordinator} onResult={setFeedback} />}{!c.canConfirm && !c.canCorrect && <p className="mt-3 text-sm text-text-secondary">{c.schedulingStatus === "CANCELLED" && !c.currentRecordId ? "Cancelled or replaced assignment; no delivery action is available." : c.endAt > w.now ? "Available after the class ends. Refresh then to confirm." : c.currentRecordId ? "Delivery recorded. Ask your coordinator if a correction is needed." : "Cancelled or replaced assignment; no delivery action is available."}</p>}{c.canRecover && <Link className="inline-link mt-3 inline-block" href={`/resolutions?leave=${encodeURIComponent(c.id)}`}>Arrange recovery for this obligation</Link>}{!!c.history.length && <details className="mt-4"><summary className="cursor-pointer font-medium">Delivery history ({c.history.length})</summary><ol className="mt-3 grid gap-3">{c.history.map(h => <li key={h.id} className="border-l-2 border-lavender pl-3 text-sm"><p>{outcome(h.status)} · {h.confirmedMinutes} min · {h.current ? "Current" : "Replaced by correction"}</p><p>{h.confirmedBy} · {deliveryTime(h.createdAt)}</p>{h.reason && <p>Audit reason: {h.reason}</p>}</li>)}</ol></details>}</li>)}</ul> : <p className="schedule-panel mt-4">No assigned classes in this semester. Published assignments will appear here.</p>}</section>}
  </>;
}
function DeliveryForm({ record: c, coordinator, onResult }: { coordinator: boolean; record: DeliveryWorkspace["classes"][number]; onResult: (r: DeliveryResult) => void }) {
  const router = useRouter();
  const [expected, setExpected] = useState(c.currentRecordId);
  const [status, setStatus] = useState<"HELD" | "NOT_HELD">(c.deliveryStatus === "HELD" ? "NOT_HELD" : "HELD");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<DeliveryResult>();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false), key = useRef<string | null>(null);
  const stale = expected !== c.currentRecordId;
  function edit() { key.current = null; setResult(undefined); }
  function submit() {
    if (busy.current || stale) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const r = await deliveryAction({ operation: c.currentRecordId ? "correct" : "confirm", occurrenceId: c.id, status, expectedRecordId: expected, ...(coordinator ? { reason } : {}), requestId: key.current ?? (key.current = crypto.randomUUID()) });
        setResult(r); onResult(r);
        if (r.ok) { setExpected(r.recordId); setStatus(status === "HELD" ? "NOT_HELD" : "HELD"); key.current = null; router.refresh(); }
      } catch { setResult({ ok: false, code: "ERROR", message: "Could not reach the server. Your input is retained; retry the same operation." }); }
      finally { busy.current = false; }
    });
  }
  return <form aria-label={`Delivery for ${c.course}`} className="mt-4 grid gap-3" onSubmit={e => { e.preventDefault(); submit(); }}>
    <label htmlFor={`outcome-${c.id}`}>{c.currentRecordId ? "Corrected outcome" : "Delivery outcome"}</label><select id={`outcome-${c.id}`} className="input" disabled={pending || stale} value={status} onChange={e => { setStatus(e.target.value as typeof status); edit(); }}><option value="HELD">Held — full scheduled duration</option><option value="NOT_HELD">Not held — no credit</option></select>
    {coordinator && <><label htmlFor={`reason-${c.id}`}>{c.currentRecordId ? "Correction reason (required)" : "Confirmation reason (required)"}</label><Input id={`reason-${c.id}`} required maxLength={1000} disabled={pending} value={reason} onChange={e => { setReason(e.target.value); edit(); }} aria-describedby={`feedback-${c.id}`} /></>}
    <Button type="submit" className="justify-self-start" disabled={pending || stale}>{pending ? "Saving…" : c.currentRecordId ? "Save correction" : "Confirm delivery"}</Button>
    <p id={`feedback-${c.id}`} role="status" className={result?.ok ? "text-success" : "text-danger"}>{result?.message}</p>
    {(stale || (result && !result.ok && result.code === "STALE_VERSION")) && <div className="text-warning"><p>Delivery changed. Refresh current status, review the current outcome, then use the latest record. Your reason is retained.</p><Button variant="secondary" disabled={pending} onClick={() => { setExpected(c.currentRecordId); key.current = null; setResult(undefined); router.refresh(); }}>Use refreshed record</Button></div>}
  </form>;
}
