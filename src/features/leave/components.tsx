"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { tierNames } from "@/domain/resolution/engine";
import { clockTime } from "@/domain/scheduling/timetable";
import type { LeaveWorkspace } from "@/server/services/leave";
import { leaveAction, leaveImpactAction } from "./actions";
import { leaveLabels, type LeaveImpact, type LeaveResult } from "./schema";

export function Impact({ impact }: { impact: LeaveImpact }) {
  return <div><p className="my-3 font-medium">{impact.classes.length} affected classes · {impact.minutes} minutes</p><p className="text-sm text-text-secondary">Schedule revision {impact.revision}. Approval rechecks current future classes.</p>{!impact.classes.length ? <p className="mt-3">No future teaching is affected. A zero-class request is allowed; no class resolution is needed.</p> : <ul className="mt-4 grid gap-3">{impact.classes.map(o => <li className="rounded-control border border-border-subtle p-3" key={o.id}><p className="font-medium">{o.course}</p><p>{o.date} · {clockTime(o.startMinute)}–{clockTime(o.endMinute)} · {o.minutes} minutes</p><p className="text-sm text-text-secondary">{o.section} · {o.room}</p></li>)}</ul>}</div>;
}
export function LeaveWorkspaceView({ workspace: w }: { workspace: LeaveWorkspace }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<LeaveResult>();
  function saved(result: LeaveResult) {
    setFeedback(result);
    if (result.ok && result.leaveId) { router.push(`/leave?request=${encodeURIComponent(result.leaveId)}`, { scroll: false }); router.refresh(); }
  }
  return <>
    <div role="status" className={`my-4 ${feedback?.ok ? "text-success" : "text-danger"}`}>{feedback?.message}</div>
    <Button variant="secondary" onClick={() => router.refresh()}>Refresh current status</Button><p className="mt-2 text-sm text-text-secondary">Refresh loads current decisions and schedule impact. Unsaved request dates and reasons stay in this form.</p>
    {w.canSubmit && <><h2 className="mt-8 mb-4 text-lg font-semibold">Request leave</h2>{!w.eligibleApprover && <p role="status" className="mb-4 text-warning">No eligible separate HoD approver is available. You can submit, but your request must wait for another authorized HoD. Self-approval is not allowed.</p>}{w.semesters.length ? <RequestForm semesters={w.semesters} today={w.today} onResult={saved} /> : <p className="schedule-panel">No current or future semester is available. Ask your coordinator to configure one.</p>}</>}
    <section aria-labelledby="requests-heading" className="mt-8"><h2 id="requests-heading" className="text-lg font-semibold">Leave requests</h2>{!w.requests.length ? <p className="schedule-panel mt-4">No leave requests yet.{w.canSubmit ? " Choose dates above to preview and submit." : " Faculty requests will appear here for departmental review."}</p> : <ul className="mt-4 grid gap-3">{w.requests.map(r => <li key={r.id} className="schedule-panel"><Link className="inline-link font-medium" href={`/leave?request=${encodeURIComponent(r.id)}`} aria-current={w.detail?.id === r.id ? "page" : undefined}>{r.faculty.user.name} · {r.startDate} to {r.endDate}</Link><p className="mt-2 text-sm">{leaveLabels[r.status]} · {r.semester.name}</p></li>)}</ul>}</section>
    {w.detail && <section className="schedule-panel mt-6" aria-labelledby="review-heading"><h2 id="review-heading" className="text-lg font-semibold">Request details · {leaveLabels[w.detail.status]}</h2><p className="mt-3">{w.detail.faculty.user.name} · {w.detail.startDate} to {w.detail.endDate} · Version {w.detail.version}</p>{w.detail.privateFields && <div className="my-4"><h3 className="font-medium">Private reason · owner and HoD only</h3><p className="whitespace-pre-wrap">{w.detail.privateFields.privateReason || "No private reason supplied."}</p>{w.detail.privateFields.rejectionReason && <><h3 className="mt-3 font-medium">Rejection reason</h3><p className="whitespace-pre-wrap">{w.detail.privateFields.rejectionReason}</p></>}</div>}
      {w.detail.status === "SUBMITTED" && <><h3 className="mt-4 font-medium">Current provisional impact</h3><Impact impact={w.detail.impact} /></>}
      {w.detail.status === "APPROVED" && <p className="mt-4">{w.detail.cancelled} classes were cancelled by this approval. Their teaching obligations remain; delivery is unchanged. {w.detail.unresolved ? `${w.detail.unresolved} classes remain unresolved.` : w.detail.cancelled ? "All affected obligations have active coverage or confirmed delivery. Scheduling and delivery remain separate." : "No class resolution is needed."} Approved leave cannot be edited, withdrawn or reversed in this MVP. Reversal requires a separately reviewed scheduling change.</p>}
      {w.canResolve && w.detail.status === "APPROVED" && <Link className="inline-link mt-3 inline-block" href={`/resolutions?leave=${encodeURIComponent(w.detail.id)}`}>View resolution board (coordinator access)</Link>}
      {(w.detail.status === "REJECTED" || w.detail.status === "WITHDRAWN") && <p className="mt-4">This request is closed. It cannot be approved or reopened. You may submit a new request for valid dates.</p>}
      {(w.detail.canReview || w.detail.canWithdraw) && <DecisionForm key={`${w.detail.id}/${w.detail.version}`} detail={w.detail} onResult={saved} />}
    </section>}
  </>;
}
function RequestForm({ semesters, today, onResult }: { semesters: LeaveWorkspace["semesters"]; today: string; onResult: (r: LeaveResult) => void }) {
  const [semesterId, setSemester] = useState(semesters[0].id);
  const semester = semesters.find(s => s.id === semesterId) ?? semesters[0];
  const minimum = today > semester.startDate ? today : semester.startDate;
  const [startDate, setStart] = useState(minimum), [endDate, setEnd] = useState(minimum), [privateReason, setReason] = useState("");
  const [preview, setPreview] = useState<LeaveImpact>(), [result, setResult] = useState<LeaveResult>();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false), requestKey = useRef<string | null>(null);
  const dates = { semesterId, startDate, endDate };
  function edited() { setPreview(undefined); setResult(undefined); requestKey.current = null; }
  function run(operation: "preview" | "submit") {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const response = operation === "preview" ? await leaveImpactAction(dates) : await leaveAction({ ...dates, privateReason, operation: "submit", requestId: requestKey.current ?? (requestKey.current = crypto.randomUUID()) });
        setResult(response);
        if (response.impact) setPreview(response.impact);
        if (operation === "submit") { onResult(response); if (response.ok) { requestKey.current = null; setPreview(undefined); } }
      } catch { const response = { ok: false, message: "Could not reach the server. Your input is retained. Retry the same operation." }; setResult(response); }
      finally { busy.current = false; }
    });
  }
  const errors = (field: string) => result?.fieldErrors?.[field];
  return <div className="grid gap-6 xl:grid-cols-2"><form className="schedule-panel grid gap-4" aria-label="Leave request" onSubmit={e => { e.preventDefault(); run("submit"); }}>
    <label htmlFor="leave-semester">Semester</label><select id="leave-semester" className="input" value={semesterId} disabled={pending} onChange={e => { setSemester(e.target.value); edited(); }}>{semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <p className="text-sm text-text-secondary">Semester: {semester.startDate} to {semester.endDate} · Asia/Kolkata</p>
    <label htmlFor="leave-start">Start date (inclusive)</label><input id="leave-start" className="input" type="date" required min={minimum} max={semester.endDate} value={startDate} disabled={pending} aria-invalid={!!errors("startDate")} aria-describedby="leave-start-error" onChange={e => { setStart(e.target.value); edited(); }} /><p id="leave-start-error" className="text-sm text-danger">{errors("startDate")?.join(" ")}</p>
    <label htmlFor="leave-end">End date (inclusive)</label><input id="leave-end" className="input" type="date" required min={minimum} max={semester.endDate} value={endDate} disabled={pending} aria-invalid={!!errors("endDate")} aria-describedby="leave-end-error" onChange={e => { setEnd(e.target.value); edited(); }} /><p id="leave-end-error" className="text-sm text-danger">{errors("endDate")?.join(" ")}</p>
    <label htmlFor="leave-reason">Private reason (optional)</label><textarea id="leave-reason" className="input" rows={3} maxLength={2000} disabled={pending} value={privateReason} aria-describedby="leave-reason-help leave-reason-error" aria-invalid={!!errors("privateReason")} onChange={e => { setReason(e.target.value); requestKey.current = null; }} /><p id="leave-reason-help" className="text-sm text-text-secondary">Only you and authorized departmental HoDs can read this. Maximum 2,000 characters.</p><p id="leave-reason-error" className="text-sm text-danger">{errors("privateReason")?.join(" ")}</p>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" type="button" disabled={pending} onClick={() => run("preview")}>Preview impact</Button><Button type="submit" disabled={pending}>{pending ? "Working…" : "Submit leave"}</Button></div><p role="status" className={result?.ok ? "text-success" : "text-danger"}>{result?.message}</p>
  </form><section className="schedule-panel self-start" aria-labelledby="impact-heading" aria-busy={pending}><h3 id="impact-heading" className="text-lg font-semibold">Read-only impact preview</h3>{preview ? <>{preview.revision < semester.scheduleRevision && <p role="status" className="mt-3 text-warning">This preview is stale because the schedule changed. Preview impact again for current classes.</p>}<Impact impact={preview} /></> : <p className="mt-3">Choose dates and preview the actual future dated classes and teaching minutes. A preview reserves nothing.</p>}<p className="mt-4 text-sm text-text-secondary">Coverage estimates use hypothetical approval and greedy batch choices. Acceptance, HoD exceptions and publication remain separate steps.</p>{preview?.coverage && <div className="mt-3"><h4 className="font-medium">Provisional coverage estimate</h4><p>{preview.coverage.possible} potentially recoverable · {preview.coverage.unresolved} unresolved. {preview.coverage.searchComplete ? "Search completed within the demo window." : "Search incomplete; infeasibility is not proven."}</p><ul className="mt-2 text-sm">{preview.coverage.tiers.map(t => <li key={t.tier}>{tierNames[t.tier]}: {t.count}</li>)}</ul><p className="mt-2 text-sm">Estimates only; no class is covered or reserved.</p></div>}</section></div>;
}
function DecisionForm({ detail, onResult }: { detail: NonNullable<LeaveWorkspace["detail"]>; onResult: (r: LeaveResult) => void }) {
  const [reason, setReason] = useState(""), [result, setResult] = useState<LeaveResult>();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false), keys = useRef<Record<string, string>>({});
  function decide(operation: "approve" | "reject" | "withdraw") {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const response = await leaveAction({ operation, leaveId: detail.id, expectedVersion: detail.version, requestId: keys.current[operation] ?? (keys.current[operation] = crypto.randomUUID()), ...(operation === "reject" ? { rejectionReason: reason } : {}) });
        setResult(response); onResult(response);
      } catch { setResult({ ok: false, message: "Could not reach the server. Your decision input is retained. Retry or refresh current status." }); }
      finally { busy.current = false; }
    });
  }
  return <div className="mt-5 grid gap-4" aria-busy={pending}>{detail.canReview && <><p>Approval cancels current future classes and releases their reservations. It does not arrange cover or mark classes held.</p><label htmlFor="rejection-reason">Rejection reason (required to reject)</label><textarea id="rejection-reason" className="input" rows={3} value={reason} maxLength={2000} disabled={pending} aria-invalid={!!result?.fieldErrors?.rejectionReason} aria-describedby="rejection-error" onChange={e => { setReason(e.target.value); delete keys.current.reject; }} /><p id="rejection-error" className="text-sm text-danger">{result?.fieldErrors?.rejectionReason?.join(" ")}</p><div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => decide("approve")}>{pending ? "Working…" : "Approve leave"}</Button><Button disabled={pending} variant="secondary" onClick={() => decide("reject")}>Reject leave</Button></div></>}{detail.canWithdraw && <Button variant="secondary" disabled={pending} onClick={() => decide("withdraw")}>{pending ? "Working…" : "Withdraw pending leave"}</Button>}<p role="status" className={result?.ok ? "text-success" : "text-danger"}>{result?.message}</p></div>;
}
