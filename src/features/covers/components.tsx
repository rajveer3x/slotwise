"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockTime } from "@/domain/scheduling/timetable";
import { rejectionLabels } from "@/domain/resolution/engine";
import type { Board } from "@/features/resolutions/schema";
import type { Candidate } from "@/domain/resolution/engine";
import type { ConsentCard, CoverResult, CoverWorkspace } from "./schema";
import { coverAction } from "./actions";

export const statusLabel: Record<string, string> = { PENDING: "Awaiting response", ACCEPTED: "Accepted—pending publication", DECLINED: "Declined", EXPIRED: "Expired", CANCELLED: "Cancelled", APPROVED: "Approved—pending publication", REJECTED: "Rejected" };
function localTime(value: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function useCoverMutation(onSuccess?: () => void) {
  const [feedback, setFeedback] = useState<CoverResult>(), [pending, startTransition] = useTransition();
  const busy = useRef(false), retry = useRef<{ payload: string; id: string } | null>(null);
  const router = useRouter();
  function run(input: Record<string, unknown>) {
    if (busy.current) return;
    const payload = JSON.stringify(input);
    if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await coverAction({ ...input, requestId: retry.current!.id });
        setFeedback(result);
        if (result.ok) { retry.current = null; onSuccess?.(); }
        if (result.ok || ["STALE_VERSION", "CONFLICT", "EXPIRED"].includes(result.code ?? "")) router.refresh();
      } catch { setFeedback({ ok: false, message: "Could not reach the server. Your input is retained. Retry or refresh." }); }
      finally { busy.current = false; }
    });
  }
  return { feedback, pending, run };
}
function Feedback({ value }: { value?: CoverResult }) {
  return <p role="status" className={`my-3 ${value?.ok ? "text-success" : "text-danger"}`}>{value?.message}</p>;
}

export function RequestSelectedConsent({ board, leaveId, candidate, disabled, onSuccess }: { board: Board; leaveId: string; candidate: Candidate; disabled: boolean; onSuccess: () => void }) {
  const [reason, setReason] = useState(""), [hours, setHours] = useState("24");
  const mutation = useCoverMutation(onSuccess), occurrenceId = candidate.assignments[0].occurrenceId;
  const saved = board.savedSelections[occurrenceId];
  const exact = saved?.candidateId === candidate.id;
  const live = board.history.find(h => h.itemId === saved?.itemId && h.candidateId === candidate.id && ["PENDING", "ACCEPTED", "APPROVED"].includes(h.status));
  if (![1, 5].includes(candidate.tier)) return null;
  const pending = disabled || mutation.pending;
  return <div className="mt-4 border-t border-border-subtle pt-4" aria-busy={mutation.pending}>
    <h5 className="font-semibold">{candidate.tier === 1 ? "Invite this substitute" : "Request exact Saturday approval"}</h5>
    <p className="my-2 text-sm">{exact ? "This exact candidate is saved." : "Save this selected candidate before requesting consent."} Responses reserve nothing; publication rechecks availability.</p>
    {live ? <p className="my-3 text-warning">{live.kind === "saturday" && live.status === "PENDING" ? "Pending HoD approval" : statusLabel[live.status]}{live.expiresAt && ` · Expires ${localTime(live.expiresAt)} · Asia/Kolkata`}. <Link className="inline-link" href="/cover-requests">Review request and history</Link></p> : <form className="grid gap-3" onSubmit={e => { e.preventDefault(); mutation.run({ operation: candidate.tier === 1 ? "invite" : "request-exception", leaveId, occurrenceId, candidateId: candidate.id, expectedVersion: board.planVersion, expectedToken: board.token, ...(candidate.tier === 1 ? { expiryHours: Number(hours) } : { reason }) }); }}>
      {candidate.tier === 1 ? <label>Response window (hours)<Input type="number" min={1} max={168} required value={hours} disabled={pending} onChange={e => setHours(e.target.value)} /><span className="mt-1 block text-sm text-text-secondary">Demo default: 24 hours, capped by class start. The server enforces expiry.</span></label> : <label>Saturday request reason (required)<textarea className="input mt-2" rows={3} required maxLength={1000} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /><span className="mt-1 block text-sm text-text-secondary">Earlier-tier explanations are attached automatically. A different departmental HoD must decide.</span></label>}
      <Button type="submit" disabled={pending || !exact || (candidate.tier === 5 && !reason.trim())}>{mutation.pending ? "Sending…" : candidate.tier === 1 ? "Send cover invitation" : "Request HoD exception"}</Button>
    </form>}
    <Feedback value={mutation.feedback} />
  </div>;
}
export function CoverWorkspaceView({ workspace }: { workspace: CoverWorkspace }) {
  const router = useRouter();
  return <>
    <p className="mt-3 text-sm text-text-secondary">Server checked {localTime(workspace.computedAt)} · Asia/Kolkata. Refresh to check for new responses and expiry.</p>
    <div className="my-5"><Button variant="secondary" onClick={() => router.refresh()}>Refresh responses</Button></div>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <section aria-labelledby="covers-heading" className="min-w-0"><h2 id="covers-heading" className="mb-4 text-xl font-semibold">Cover invitations</h2>{workspace.covers.length ? <ul className="grid gap-4">{workspace.covers.map(r => <li key={r.id}><ConsentCardView card={r} /></li>)}</ul> : <p className="schedule-panel">No cover invitations in your scope. Coordinators can invite a saved substitute from Resolutions.</p>}</section>
      <section aria-labelledby="exceptions-heading" className="min-w-0"><h2 id="exceptions-heading" className="mb-4 text-xl font-semibold">Saturday exceptions</h2>{workspace.exceptions.length ? <ul className="grid gap-4">{workspace.exceptions.map(r => <li key={r.id}><ConsentCardView card={r} /></li>)}</ul> : <p className="schedule-panel">No Saturday exceptions in your scope. A saved Saturday candidate needs a request before HoD review.</p>}</section>
    </div>
    <section aria-labelledby="updates-heading" className="schedule-panel mt-6"><h2 id="updates-heading" className="text-lg font-semibold">Your recovery updates</h2><p className="my-2 text-sm text-text-secondary">Persisted in-app updates · latest 30 · refresh on navigation. These are response updates, not published timetable changes.</p>{workspace.notifications.length ? <ul className="grid gap-3">{workspace.notifications.map(n => <li key={n.id} className="border-t border-border-subtle pt-3"><p>{n.message}</p><p className="text-sm text-text-secondary">{localTime(n.createdAt)} · Asia/Kolkata</p></li>)}</ul> : <p>No recovery updates for your account.</p>}</section>
  </>;
}
function ConsentCardView({ card: r }: { card: ConsentCard }) {
  const [reason, setReason] = useState(""), [rejectionLimit, setRejectionLimit] = useState(20);
  const { run, pending, feedback } = useCoverMutation();
  const label = r.kind === "saturday" && r.status === "PENDING" ? "Pending HoD approval" : statusLabel[r.status] ?? r.status;
  return <article className="schedule-panel min-w-0" aria-label={`${r.kind === "cover" ? "Cover invitation" : "Saturday exception"} ${r.id}`} aria-busy={pending}>
    <h3 className="text-lg font-semibold">{label}</h3>
    {r.candidate.assignments.map(a => <div key={a.occurrenceId} className="my-3 text-sm"><p className="font-semibold">{r.labels[a.allocationId]}</p><p>{a.date} · {clockTime(a.startMinute)}–{clockTime(a.endMinute)} · Asia/Kolkata</p><p>{r.labels[a.facultyId]} · {r.labels[a.sectionId]} · {a.roomId ? r.labels[a.roomId] : "Online"}</p></div>)}
    <p className="text-sm">Requested by {r.requestedBy}{r.invitedName && ` · Invited: ${r.invitedName}`}</p>
    {r.expiresAt && <p className="mt-2 text-sm font-medium">Response expires {localTime(r.expiresAt)} · Asia/Kolkata</p>}
    {r.respondedAt && <p className="mt-2 text-sm">Decision recorded {localTime(r.respondedAt)} · Asia/Kolkata</p>}
    {r.reason && <p className="mt-3">Request reason: {r.reason}</p>}{r.decisionReason && <p className="mt-3">Decision reason: {r.decisionReason}</p>}{r.closedReason && <p className="mt-3">{r.closedReason}</p>}
    {r.stale && <p className="my-3 text-warning">This saved candidate or its eligibility changed. Its consent cannot authorize a different candidate; the coordinator must recompute and request fresh consent.</p>}
    {r.earlierTiers && <details className="mt-3"><summary className="cursor-pointer py-3">Why earlier tiers failed ({r.earlierTiers.length} alternatives)</summary><p>Recorded at request time; eligibility and tier order are rechecked by the server on approval.</p><ul className="my-3 grid gap-2">{Object.entries(r.earlierTiers.reduce<Record<string, number>>((counts, x) => { for (const code of x.codes) { const key = `Tier ${x.tier}: ${rejectionLabels[code] ?? code}`; counts[key] = (counts[key] ?? 0) + 1; } return counts; }, {})).map(([rule, count]) => <li key={rule}>{rule}: {count}</li>)}</ul><p className="text-sm">Showing up to {rejectionLimit} recorded alternatives; totals include all earlier-tier explanations.</p><ul className="mt-3 grid gap-3">{r.earlierTiers.slice(0, rejectionLimit).map((x, i) => <li key={i} className="border-t border-border-subtle pt-2">Tier {x.tier}{x.proposed && ` · ${x.proposed.date} ${clockTime(x.proposed.startMinute)}–${clockTime(x.proposed.endMinute)}`}: {x.codes.map(code => rejectionLabels[code] ?? code).join("; ")}{x.reason && ` · ${x.reason}`}</li>)}</ul>{rejectionLimit < r.earlierTiers.length && <Button variant="secondary" onClick={() => setRejectionLimit(n => n + 20)}>Show more earlier alternatives</Button>}</details>}
    <p className="my-3 text-sm text-text-secondary">Consent is for this exact candidate. Nothing is reserved or published. Publication may still fail if the schedule changes.</p>
    {r.canRespond && <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => run({ operation: "accept", id: r.id })}>{pending ? "Saving…" : "Accept cover"}</Button><Button variant="secondary" disabled={pending} onClick={() => run({ operation: "decline", id: r.id })}>Decline cover</Button></div>}
    {r.canCancel && <Button variant="secondary" disabled={pending} onClick={() => run({ operation: "cancel-cover", id: r.id })}>Cancel cover invitation</Button>}
    {r.canReview && <form className="mt-3 grid gap-3" onSubmit={e => { e.preventDefault(); run({ operation: "approve-exception", id: r.id, reason }); }}><label>HoD decision reason (required)<textarea className="input mt-2" rows={3} required maxLength={1000} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></label><div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending || !reason.trim()}>{pending ? "Saving…" : "Approve exact Saturday"}</Button><Button variant="secondary" disabled={pending || !reason.trim()} onClick={() => run({ operation: "reject-exception", id: r.id, reason })}>Reject Saturday</Button></div></form>}
    {r.kind === "saturday" && r.status === "PENDING" && !r.canReview && !r.stale && <p className="text-warning">Awaiting a different authorized HoD. You cannot approve your own request or leave exception.</p>}
    <Feedback value={feedback} />
  </article>;
}
