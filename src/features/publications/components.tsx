"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockTime } from "@/domain/scheduling/timetable";
import { tierNames, type Assignment } from "@/domain/resolution/engine";
import type { Board } from "@/features/resolutions/schema";
import { publicationAction } from "./actions";
import type { PublicationPreview, PublicationResult } from "./schema";
function AssignmentSummary({ assignment: a, labels }: { assignment: Assignment; labels: Record<string, string> }) {
  return <div className="grid gap-1 text-sm"><p className="font-medium">{labels[a.allocationId]}</p><p>{a.date} · {clockTime(a.startMinute)}–{clockTime(a.endMinute)}</p><p>Teacher: {labels[a.facultyId]}</p><p>Section: {labels[a.sectionId]}</p><p>Room: {a.roomId ? labels[a.roomId] : "Online · no room"}</p></div>;
}
export function PublicationReview({ board, leaveId, disabled }: { board: Board; leaveId: string; disabled: boolean }) {
  const [included, setIncluded] = useState<Record<string, boolean>>({}), [urls, setUrls] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PublicationPreview>(), [feedback, setFeedback] = useState<PublicationResult>();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false), requestKey = useRef<string | null>(null);
  const saved = board.items.filter(i => i.selected && board.savedSelections[i.original.occurrenceId]?.candidateId === i.selected.id);
  const selected = saved.filter(i => included[i.original.occurrenceId] !== false);
  const meetingUrls = Object.fromEntries(selected.filter(i => i.selected?.tier === 4).map(i => [i.original.occurrenceId, urls[i.original.occurrenceId] ?? ""]));
  const stale = !!preview && (preview.token !== board.token || preview.planVersion !== board.planVersion || disabled) || feedback?.ok === false && feedback.code === "STALE_VERSION";
  const published = feedback?.ok && !!feedback.publicationId;
  function edited() { setPreview(undefined); setFeedback(undefined); requestKey.current = null; }
  function run(operation: "preview" | "publish") {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await publicationAction({ operation, leaveId, occurrenceIds: selected.map(i => i.original.occurrenceId), meetingUrls, expectedToken: board.token, expectedVersion: board.planVersion, requestId: requestKey.current ?? (requestKey.current = crypto.randomUUID()), ...(operation === "publish" && preview ? { previewFingerprint: preview.fingerprint } : {}) });
        setFeedback(result);
        if (result.ok) { if (result.preview) setPreview(result.preview); requestKey.current = null; }
      } catch { setFeedback({ ok: false, code: "NETWORK", message: "Could not reach the server. Your subset and links are retained. Retry the same operation." }); }
      finally { busy.current = false; }
    });
  }
  return <section className="schedule-panel mt-6" aria-labelledby="publication-heading" aria-busy={pending}>
    <h2 id="publication-heading" className="text-xl font-semibold">Preview and publish</h2>
    <p className="my-3">Choose a saved subset for atomic publication. One invalid selected class blocks the whole batch. Unselected classes stay unresolved and need recomputation after publication.</p>
    {!saved.length ? <p>Save valid candidate selections above to review a publication.</p> : <fieldset disabled={pending || disabled || !!published} className="my-4 grid gap-4"><legend className="font-medium">Classes to publish</legend>{saved.map(i => {
      const id = i.original.occurrenceId;
      return <div key={id} className="rounded-control border border-border-subtle p-3"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0 accent-primary" checked={included[id] !== false} onChange={e => { setIncluded({ ...included, [id]: e.target.checked }); edited(); }} /><span>{board.labels[i.original.allocationId]} · {i.original.date} {clockTime(i.original.startMinute)} · {tierNames[i.selected!.tier]}</span></label>{i.selected!.tier === 4 && <label className="mt-3 block">HTTPS meeting URL for {board.labels[i.original.allocationId]}<Input className="mt-2" type="url" maxLength={2048} value={urls[id] ?? ""} onChange={e => { setUrls({ ...urls, [id]: e.target.value }); edited(); }} /></label>}</div>;
    })}</fieldset>}
    {disabled && <p className="my-3 text-warning">Recompute, review and save current selections before publication.</p>}
    <div className="my-4 flex flex-wrap gap-3"><Button variant="secondary" disabled={pending || disabled || !selected.length || !!published} onClick={() => { requestKey.current = null; run("preview"); }}>{pending ? "Working…" : "Preview selected changes"}</Button></div>
    <p role="status" className={`my-3 ${feedback?.ok ? "text-success" : "text-danger"}`}>{feedback?.message}</p>
    {stale && !published && <p role="status" className="my-3 text-warning">Stale preview. Recompute, save and preview again before publishing. Your subset and meeting links are retained.</p>}
    {published && <Link className="inline-link" href="/timetable">View published timetable</Link>}
    {preview && <div className="mt-5 grid gap-5"><h3 className="text-lg font-semibold">Before / After · Asia/Kolkata</h3><p>Revision {preview.revision} · {preview.selectedCount} selected changes · {preview.unresolved.length} unresolved after publication · {preview.recipients.length} recipients</p>
      {!!preview.blockers.length && <div className="rounded-control border border-danger bg-danger-tint p-4"><h4 className="font-semibold text-danger">Publication blocked</h4><ul className="mt-2 list-inside list-disc">{preview.blockers.map(b => <li key={b}>{b}</li>)}</ul></div>}
      {preview.changes.map(c => <article key={c.after.occurrenceId} className="rounded-control border border-border-subtle p-4"><h4 className="mb-3 font-semibold">{tierNames[c.tier]}{c.tier === 2 ? " · Both sides commit together" : ""}</h4><div className="grid gap-4 md:grid-cols-2"><div><p className="mb-2 font-semibold">Before · {c.beforeStatus === "CANCELLED" ? "Cancelled by leave" : "Original assignment"}</p><AssignmentSummary assignment={c.before} labels={preview.labels} /></div><div className="rounded-control bg-primary-tint p-3"><p className="mb-2 font-semibold">After · Delivery pending</p><AssignmentSummary assignment={c.after} labels={preview.labels} />{c.meetingUrl && <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-link mt-2 block break-all">Meeting link: {c.meetingUrl}</a>}</div></div></article>)}
      <details><summary className="cursor-pointer py-3">Affected recipients ({preview.recipients.length})</summary><ul className="grid gap-2">{preview.recipients.map(r => <li key={r.id}>{r.name} · {r.role}</li>)}</ul><p className="mt-3 text-sm">In-app records commit with the schedule. No external messages are sent.</p></details>
      <details><summary className="cursor-pointer py-3">Unresolved classes ({preview.unresolved.length})</summary>{preview.unresolved.length ? <ul className="grid gap-3">{preview.unresolved.map(a => <li key={a.occurrenceId}><AssignmentSummary assignment={a} labels={preview.labels} /></li>)}</ul> : <p>All currently unresolved classes of this leave are selected.</p>}</details>
      <p className="text-sm text-text-secondary">Preview and consent reserve nothing. Publication rechecks permissions, resources, leave and exact consent. Required teaching minutes are preserved; publication never confirms delivery.</p>
    </div>}
    <div className="mt-5">{preview && <Button disabled={pending || disabled || !!stale || !!preview.blockers.length || !!published} onClick={() => run("publish")}>{pending ? "Publishing…" : `Publish ${preview.selectedCount} changes`}</Button>}</div>
  </section>;
}
