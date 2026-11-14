"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { clockTime } from "@/domain/scheduling/timetable";
import { rejectionLabels, tierNames, type Assignment, type Candidate, type Decisions } from "@/domain/resolution/engine";
import type { ResolutionWorkspace } from "@/server/services/resolutions";
import type { Board, ResolutionResult } from "./schema";
import { RequestSelectedConsent, statusLabel } from "@/features/covers/components";
import { PublicationReview } from "@/features/publications/components";
import { resolutionAction } from "./actions";

export function ResolutionWorkspaceView({ workspace: w }: { workspace: ResolutionWorkspace }) {
  return <>
    <nav aria-label="Approved leave" className="my-6"><h2 className="mb-3 font-semibold">Approved leave</h2>{w.requests.length ? <ul className="grid gap-2">{w.requests.map(r => <li key={r.id}><Link className="inline-link" href={`/resolutions?leave=${encodeURIComponent(r.id)}`} aria-current={w.leaveId === r.id ? "page" : undefined}>{r.faculty.user.name} · {r.startDate} to {r.endDate}</Link></li>)}</ul> : <p className="schedule-panel">No approved leave yet. Not-held classes can be recovered separately below.</p>}</nav>
    <nav aria-label="Not-held recovery" className="my-6"><h2 className="mb-3 font-semibold">Not-held classes</h2>{w.missed.length ? <ul className="grid gap-2">{w.missed.map(r => <li key={r.id}><Link className="inline-link" href={`/resolutions?leave=${encodeURIComponent(r.id)}`} aria-current={w.leaveId === r.id ? "page" : undefined}>{r.teachingObligation.allocation.course.code} · {r.faculty.user.name} · {r.localDate} · Not held</Link></li>)}</ul> : <p>No unresolved not-held classes. Ordinary missed classes remain separate from leave.</p>}</nav>
    {w.board && w.leaveId && <ResolutionBoard key={w.leaveId} initial={w.board} leaveId={w.leaveId} />}
  </>;
}
function AssignmentView({ a, board }: { a: Assignment; board: Board }) {
  const label = (id: string) => board.labels[id] ?? "Unavailable record";
  return <span className="my-2 block text-sm"><span className="block font-medium">{label(a.allocationId)}</span><span className="block">{a.date} · {clockTime(a.startMinute)}–{clockTime(a.endMinute)}</span><span className="block">{label(a.facultyId)} · {label(a.sectionId)} · {a.roomId ? label(a.roomId) : "Online · no room required"}</span></span>;
}
function ResolutionBoard({ initial, leaveId }: { initial: Board; leaveId: string }) {
  const [board, setBoard] = useState(initial), [decisions, setDecisions] = useState<Decisions>(initial.decisions);
  const [active, setActive] = useState(initial.items[0]?.original.occurrenceId), [feedback, setFeedback] = useState<ResolutionResult>();
  const [needsCompute, setNeedsCompute] = useState(false), [pending, startTransition] = useTransition();
  const [rejectionLimit, setRejectionLimit] = useState(20);
  const busy = useRef(false), requestId = useRef<string | null>(null);
  const item = board.items.find(i => i.original.occurrenceId === active) ?? board.items[0];
  const newerPage = initial.revisions.some(r => r.scheduleRevision > (board.revisions.find(b => b.id === r.id)?.scheduleRevision ?? -1));
  const stale = board.stale || newerPage || feedback?.code === "STALE_VERSION";
  function run(operation: "compute" | "save", next = decisions) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await resolutionAction({ operation, leaveId, decisions: next, expectedToken: board.token, expectedVersion: board.planVersion, requestId: requestId.current ?? (requestId.current = crypto.randomUUID()) });
        setFeedback(result);
        if (result.ok && result.board) { setBoard(result.board); setDecisions(result.board.decisions); setNeedsCompute(false); requestId.current = null; }
      } catch { setFeedback({ ok: false, message: "Could not reach the server. Your choices are retained. Retry or recompute." }); }
      finally { busy.current = false; }
    });
  }
  function choose(candidate?: Candidate) {
    if (!item) return;
    const selected = { ...decisions.selected };
    if (candidate) selected[item.original.occurrenceId] = candidate.id;
    else delete selected[item.original.occurrenceId];
    const next = { ...decisions, selected };
    setDecisions(next); setNeedsCompute(true); requestId.current = null; run("compute", next);
  }
  function reject(candidate: Candidate, reason: string) {
    if (!item) return;
    const id = item.original.occurrenceId, selected = { ...decisions.selected };
    if (selected[id] === candidate.id) delete selected[id];
    const next = { selected, rejected: { ...decisions.rejected, [id]: [...(decisions.rejected[id] ?? []).filter(r => r.candidateId !== candidate.id), { candidateId: candidate.id, reason }] } };
    setDecisions(next); setNeedsCompute(true); requestId.current = null; run("compute", next);
  }
  const selectedCount = board.items.filter(i => i.selected).length;
  return <section aria-labelledby="board-heading" aria-busy={pending}>
    <h2 id="board-heading" className="text-xl font-semibold">Resolution board</h2>
    <p className="my-3">Draft only · {selectedCount} selected · {board.items.filter(i => !i.candidates.length).length} without a valid option · {board.items.length} affected classes</p>
    <p className="text-sm text-text-secondary">Schedule revision {board.revision} · Policy {board.policyVersion} · Draft version {board.planVersion}. Asia/Kolkata. Greedy batch order: original date, time, then stable class ID. This is not a global optimality proof.</p>
    <p className="mt-2 text-sm text-text-secondary">Selecting a substitute requires its invited faculty’s acceptance; Saturday requires exact HoD approval. Responses reserve nothing. Every affected class awaits publication.</p>
    <div className="my-4 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending} onClick={() => { requestId.current = null; run("compute"); }}>{pending ? "Working…" : "Recompute current resources"}</Button><Button disabled={pending || needsCompute || stale || !board.items.length} onClick={() => run("save")}>Save draft</Button></div>
    <p role="status" className={feedback?.ok ? "mb-4 text-success" : "mb-4 text-danger"}>{feedback?.message}</p>
    {stale && <p role="status" className="mb-4 text-warning">This draft is stale. Recompute and review retained choices before saving.</p>}
    {needsCompute && <p className="mb-4 text-warning">Choices changed. Recompute to validate this batch before saving.</p>}
    {!board.items.length ? <p className="schedule-panel">No classes to draft in this board. Review Not-held classes above for any missed replacements.</p> : <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <aside className="schedule-panel min-w-0" aria-label="Affected classes"><h3 className="mb-3 font-semibold">Affected classes</h3><ul className="grid gap-3">{board.items.map(i => <li key={i.original.occurrenceId}><button disabled={pending} aria-pressed={item?.original.occurrenceId === i.original.occurrenceId} onClick={() => { setActive(i.original.occurrenceId); setRejectionLimit(20); }} className={`w-full rounded-control border p-3 text-left ${item?.original.occurrenceId === i.original.occurrenceId ? "border-primary bg-primary-tint" : "border-border-control"}`}><AssignmentView a={i.original} board={board} /><span className="text-sm">{i.selectionError ? "Selection needs review" : i.selected ? "Selected · pending publication" : i.tier ? `${tierNames[i.tier]} available · unselected` : "Unresolved"}</span></button></li>)}</ul></aside>
      {item && <section className="schedule-panel min-w-0" aria-labelledby="candidates-heading"><h3 id="candidates-heading" className="text-lg font-semibold">Candidates for selected class</h3><AssignmentView a={item.original} board={board} />
        <ol aria-label="Resolution tiers" className="my-4 flex flex-wrap gap-2">{tierNames.slice(1).map((name, index) => <li key={name} className={`rounded-control border px-2 py-1 text-sm ${item.tier === index + 1 ? "border-primary bg-primary-tint" : "border-border-subtle"}`}>{index + 1}. {name} · {item.tier === index + 1 ? "First viable tier" : item.skippedTiers.includes(index + 1) ? "No usable candidate" : "Not reached"}</li>)}</ol>
        {!item.searchComplete && <p className="my-3 text-warning">Search incomplete. A search limit was reached; no claim of proven infeasibility is made.</p>}
        {item.unresolvedReason && <p role="status" className="my-3 text-warning">Unresolved · {item.unresolvedReason}</p>}
        {item.selectionError && <p role="status" className="my-3 text-danger">{item.selectionError}</p>}
        {decisions.selected[item.original.occurrenceId] && <Button variant="secondary" disabled={pending} onClick={() => choose()}>Clear selection</Button>}
        <div className="mt-4 grid gap-4">{item.candidates.map((c, index) => <CandidateCard key={c.id} candidate={c} rank={index + 1} selected={item.selected?.id === c.id} pending={pending} board={board} choose={() => choose(c)} reject={reason => reject(c, reason)} consent={item.selected?.id === c.id ? <RequestSelectedConsent board={board} leaveId={leaveId} candidate={c} disabled={pending || needsCompute || stale} onSuccess={() => { requestId.current = null; run("compute"); }} /> : undefined} />)}</div>
        {!!board.history.filter(h => h.occurrenceId === item.original.occurrenceId).length && <details className="mt-4"><summary className="cursor-pointer py-3">Response and exception history</summary><ul className="grid gap-3">{board.history.filter(h => h.occurrenceId === item.original.occurrenceId).map(h => <li key={h.id}>{h.kind === "cover" ? "Cover" : "Saturday"} · {statusLabel[h.status]}{h.decisionReason && ` · ${h.decisionReason}`}{h.closedReason && ` · ${h.closedReason}`}</li>)}</ul><p className="mt-3 text-sm">Declined, expired and HoD-rejected candidates are excluded during recomputation; history survives draft edits.</p><Link className="inline-link" href="/cover-requests">Review invitations and exceptions</Link></details>}
        <details className="mt-5"><summary className="cursor-pointer py-3 font-medium">Rejected alternatives ({item.rejections.length}) and explanations</summary>
          {!item.rejections.length ? <p>No rejected alternatives in the searched tiers.</p> : <><ul className="grid gap-3">{Object.entries(item.rejections.reduce<Record<string, number>>((counts, r) => { for (const code of r.codes) counts[code] = (counts[code] ?? 0) + 1; return counts; }, {})).map(([code, count]) => <li key={code}>{rejectionLabels[code] ?? code}: {count}</li>)}</ul><p className="my-3 text-sm">Showing up to {rejectionLimit} alternatives; totals above include all searched rejections. Later tiers are not searched while an earlier tier is usable.</p><ul className="grid gap-3">{item.rejections.slice(0, rejectionLimit).map((r, index) => <li key={index} className="border-t border-border-subtle pt-2"><p className="font-medium">{tierNames[r.tier]}</p>{r.proposed && <AssignmentView a={r.proposed} board={board} />}<p className="text-sm">{r.codes.map(code => rejectionLabels[code] ?? code).join("; ")}{r.reason && ` · Reason: ${r.reason}`}</p></li>)}</ul>{rejectionLimit < item.rejections.length && <Button variant="secondary" disabled={pending} onClick={() => setRejectionLimit(n => n + 20)}>Show more rejected alternatives</Button>}</>}
        </details>
        {!!decisions.rejected[item.original.occurrenceId]?.length && <div className="mt-4"><p>{decisions.rejected[item.original.occurrenceId].length} explicit rejections retained.</p><ul className="my-2 text-sm">{decisions.rejected[item.original.occurrenceId].map(r => <li key={r.candidateId}>{r.reason}</li>)}</ul><Button variant="secondary" disabled={pending} onClick={() => { const next = { ...decisions, rejected: { ...decisions.rejected, [item.original.occurrenceId]: [] } }; setDecisions(next); setNeedsCompute(true); requestId.current = null; run("compute", next); }}>Restore rejected candidates</Button></div>}
      </section>}
    </div>}
    <PublicationReview board={board} leaveId={leaveId} disabled={pending || needsCompute || stale} />
  </section>;
}
function CandidateCard({ candidate: c, rank, selected, pending, board, choose, reject, consent }: { consent?: React.ReactNode; candidate: Candidate; rank: number; selected: boolean; pending: boolean; board: Board; choose: () => void; reject: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <article className="rounded-control border border-border-subtle p-4" aria-label={`Candidate ${rank}`}>
    <h4 className="font-semibold">{tierNames[c.tier]} · Option {rank}{selected ? " · Selected" : ""}</h4>{c.assignments.map(a => <AssignmentView key={a.occurrenceId} a={a} board={board} />)}
    <p className="mt-3"><strong>Why recommended:</strong> {c.why}</p>{c.requires && <p className="mt-2 text-warning">{c.requires}</p>}
    <details className="my-3"><summary className="cursor-pointer py-3">Score and eligibility details</summary><p>All hard constraints passed for every destination.</p>{c.contributions.length ? <><p>Integer score: {c.score}</p><ul>{c.contributions.map(x => <li key={x.reason}>{x.reason}: {x.value > 0 ? "+" : ""}{x.value}</li>)}</ul></> : <p>{c.tier === 1 ? "Rank: lower assigned/target ratio, then fewer confirmed covers this month, then stable faculty ID. Missing positive targets are excluded." : "Rank: earlier destination date/time, stable room and candidate IDs."}</p>}</details>
    <Button variant={selected ? "secondary" : "primary"} disabled={pending || selected} onClick={choose}>{selected ? "Selected for draft" : "Select candidate"}</Button>
    {consent}
    <details className="mt-3"><summary className="cursor-pointer py-3">Reject this candidate with a reason</summary><form className="mt-2 grid gap-3" onSubmit={e => { e.preventDefault(); if (reason.trim()) reject(reason.trim()); }}><label>Rejection reason (required)<textarea className="input mt-2" required minLength={1} maxLength={500} rows={2} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} /></label><Button variant="secondary" type="submit" disabled={pending || !reason.trim()}>Reject and recompute</Button></form></details>
  </article>;
}
