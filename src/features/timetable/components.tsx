"use client";
import { useEffect, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { days, clockTime, completeness, type Placement, type SchedulingData } from "@/domain/scheduling/timetable";
import type { TimetableSnapshot } from "@/server/services/timetable";
import type { ScheduleInput, ScheduleResult, Preview } from "./schema";
import { timetableAction } from "./actions";

type Draft = TimetableSnapshot["drafts"][number];
function Feedback({ result }: { result: ScheduleResult | null }) {
  return <div role="status" aria-live="polite" className={`my-4 break-words ${result?.ok ? "text-success" : "text-danger"}`}>{result?.message}</div>;
}
function useCommand() {
  const [pending, start] = useTransition(), [result, setResult] = useState<ScheduleResult | null>(null);
  const keys = useRef(new Map<string, string>()), busy = useRef(false);
  function run(payload: Omit<ScheduleInput, "requestId">, done: (r: ScheduleResult) => void) {
    if (busy.current) return;
    busy.current = true;
    const fingerprint = JSON.stringify(payload);
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, crypto.randomUUID());
    start(async () => {
      try { const response = await timetableAction({ ...payload, requestId: keys.current.get(fingerprint)! }); setResult(response); done(response); }
      catch { setResult({ ok: false, message: "The request could not be confirmed. Your input is retained; retry to safely check the same request." }); }
      finally { busy.current = false; }
    });
  }
  return { pending, result, run };
}
export function CreateDraft({ semester, today }: { semester: NonNullable<TimetableSnapshot["semester"]>; today: string }) {
  const { pending, result, run } = useCommand();
  const [date, setDate] = useState(semester.startDate > today ? semester.startDate : today), router = useRouter();
  return <section className="schedule-panel" aria-labelledby="create-draft-heading"><h2 id="create-draft-heading" className="text-lg font-semibold">Start a weekly draft</h2><p className="my-3 text-text-secondary">Copies the latest published template when one exists. Drafts reserve nothing. The effective range ends on {semester.endDate}.</p><form onSubmit={e => { e.preventDefault(); run({ operation: "create", semesterId: semester.id, expectedRevision: semester.scheduleRevision, effectiveFrom: date }, r => { if (r.ok) router.push(`/timetable?semester=${semester.id}&draft=${r.draftId}`); }); }}><fieldset disabled={pending} className="flex flex-wrap items-end gap-4"><label className="grid gap-2">Effective from<Input type="date" required min={semester.startDate > today ? semester.startDate : today} max={semester.endDate} value={date} onChange={e => setDate(e.target.value)} /></label><Button type="submit">{pending ? "Creating…" : "Create draft"}</Button></fieldset></form><Feedback result={result} />{result?.code === "STALE_VERSION" && <Button variant="secondary" onClick={() => window.location.reload()}>Refresh page</Button>}</section>;
}
export function DraftEditor({ draft, data, semester, today, view, resource }: { draft: Draft; data: SchedulingData; semester: NonNullable<TimetableSnapshot["semester"]>; today: string; view: string; resource: string }) {
  const router = useRouter(), { pending, result, run } = useCommand();
  const [entries, setEntries] = useState(draft.entries), [version, setVersion] = useState(draft.version), [revision, setRevision] = useState(semester.scheduleRevision);
  const [effectiveFrom, setEffectiveFrom] = useState(draft.effectiveFrom), [savedDate, setSavedDate] = useState(draft.effectiveFrom);
  const [selected, setSelected] = useState(""), [preview, setPreview] = useState<Preview | null>(null), [candidate, setCandidate] = useState<Placement | null>(null);
  const stale = draft.version !== version || semester.scheduleRevision !== revision;
  const warnings = completeness(entries, data, semester.id);
  function command(operation: "save" | "preview" | "publish", next = entries) {
    setPreview(null);
    run({ operation, semesterId: semester.id, draftId: draft.id, expectedVersion: version, expectedRevision: revision, ...(operation === "save" ? { entries: next, effectiveFrom } : {}), ...(operation === "publish" ? { previewFingerprint: preview?.fingerprint } : {}) }, r => {
      if (r.ok && operation === "save") { setEntries(next); setVersion(r.version!); setRevision(r.revision!); setSavedDate(effectiveFrom); setCandidate(null); router.refresh(); }
      if (r.ok && r.preview) setPreview(r.preview);
      if (r.ok && operation === "publish") router.push(`/timetable?semester=${semester.id}&week=${effectiveFrom}`);
    });
  }
  function move(p: Placement) { setCandidate(p); command("save", [...entries.filter(e => e.seriesId !== p.seriesId), p]); }
  const description = (p: Placement) => {
    const a = data.allocations.find(a => a.id === p.allocationId)!;
    return { course: `${data.courses.find(c => c.id === a.courseId)?.code} · ${data.courses.find(c => c.id === a.courseId)?.name}`, faculty: data.faculty.find(f => f.id === a.facultyId)?.name ?? "Unavailable teacher", section: data.sections.find(s => s.id === a.sectionId)?.code ?? "Unavailable section", room: data.rooms.find(r => r.id === p.roomId)?.code ?? "Unavailable room" };
  };
  const visible = entries.filter(p => { const a = data.allocations.find(a => a.id === p.allocationId); return !resource || (view === "faculty" ? a?.facultyId : view === "room" ? p.roomId : a?.sectionId) === resource; });
  const slots = data.slots.filter(s => !s.archived && s.weekday <= 5);
  const rows = [...new Map(slots.map(s => [s.startMinute, { start: s.startMinute, end: s.endMinute }])).values()].sort((a, b) => a.start - b.start);
  const block = (p: Placement) => { const label = description(p); return <article key={p.seriesId} className={`class-block ${selected === p.seriesId ? "class-selected" : ""} ${result?.conflicts?.some(c => c.seriesId === p.seriesId) ? "class-conflict" : ""}`} draggable={!pending && !stale} onDragStart={e => { e.dataTransfer.setData("text/plain", p.seriesId); e.dataTransfer.effectAllowed = "move"; }}><p className="font-semibold break-words">{label.course}</p><p>{clockTime(p.startMinute)}–{clockTime(p.endMinute)}</p><p>{label.faculty} · {label.section} · {label.room}</p><p className="text-sm">Draft · No reservation</p><Button variant="secondary" disabled={pending} onClick={() => { setSelected(p.seriesId); document.getElementById("move-class-heading")?.focus(); }}>Move {label.course.split(" · ")[0]}</Button></article>; };
  function drop(event: DragEvent, weekday: number, startMinute: number) { event.preventDefault(); if (pending || stale) return; const p = entries.find(e => e.seriesId === event.dataTransfer.getData("text/plain")); if (p) move({ ...p, weekday, startMinute, endMinute: startMinute + p.endMinute - p.startMinute }); }
  return <section aria-labelledby="draft-heading" className="grid gap-6">
    <div className="schedule-panel"><h2 id="draft-heading" className="text-lg font-semibold">Weekly draft · Version {version}</h2><p className="mt-2">Schedule revision {revision} · Monday–Friday · Asia/Kolkata</p><p className="mt-2 text-text-secondary">Place every allocation’s weekly periods before publishing. Labs require at least two consecutive slots. Drag a class to a teaching slot, or use the Move class form.</p>
      {(stale || result?.code === "STALE_VERSION") && <div className="mt-4 rounded-control border border-warning p-3"><p>Newer data is available. Your input is retained. Refresh to load current data, then review and save your draft before previewing.</p><Button variant="secondary" onClick={() => window.location.reload()}>Refresh page</Button></div>}
      <Feedback result={result} />
      {!!result?.conflicts?.length && <section aria-label="Conflict explanations" className="rounded-control border border-danger bg-danger-tint p-4"><h3 className="font-semibold text-danger">Conflict details</h3><ul className="list-disc pl-5">{result.conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul></section>}
      {result?.code === "CONFLICT" && candidate && <section aria-label="Alternative placements" className="mt-4"><h3 className="font-semibold">Valid alternatives</h3><p>These keep the same teacher, section and duration. Other classes stay in place. Revalidated when selected.</p>{result.alternatives?.length ? <ul className="mt-3 grid gap-2">{result.alternatives.map((p, i) => <li key={i}><Button disabled={pending || stale} variant="secondary" onClick={() => move(p)}>Use {days[p.weekday]} {clockTime(p.startMinute)}–{clockTime(p.endMinute)} · {description(p).room}</Button></li>)}</ul> : <p>No valid alternative found in the configured teaching slots and rooms.</p>}</section>}
      {!!warnings.length && <details className="mt-4"><summary className="cursor-pointer font-medium">{warnings.length} incomplete allocations</summary><ul className="mt-2 list-disc pl-5">{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul></details>}
    </div>
    <div className="timetable-desktop overflow-x-auto" role="region" aria-label="Weekly draft grid; scroll horizontally for all weekdays" tabIndex={0}><table className="timetable-grid"><thead><tr><th scope="col">Time</th>{days.slice(1, 6).map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.start}><th scope="row">{clockTime(row.start)}<br />{clockTime(row.end)}</th>{[1, 2, 3, 4, 5].map(day => <td key={day} data-drop={`${day}-${row.start}`} onDragOver={e => { if (slots.some(s => s.weekday === day && s.startMinute === row.start)) e.preventDefault(); }} onDrop={e => { if (slots.some(s => s.weekday === day && s.startMinute === row.start)) drop(e, day, row.start); }} aria-label={`${days[day]} ${clockTime(row.start)}`}>{visible.filter(p => p.weekday === day && p.startMinute === row.start).map(block)}{visible.filter(p => p.weekday === day && p.startMinute < row.start && p.endMinute > row.start).map(p => <p key={p.seriesId} className="class-block">Continues: {description(p).course} until {clockTime(p.endMinute)}</p>)}</td>)}</tr>)}</tbody></table></div>
    <section className="timetable-mobile" aria-label="Weekly draft agenda">{[1, 2, 3, 4, 5].map(day => <div key={day} className="mb-4"><h3 className="mb-2 font-semibold">{days[day]}</h3>{visible.filter(p => p.weekday === day).sort((a, b) => a.startMinute - b.startMinute).map(block)}{!visible.some(p => p.weekday === day) && <p className="text-text-secondary">No draft classes.</p>}</div>)}</section>
    {!visible.length && <p>No draft classes match this view. Use Place class below to add a class, or clear the resource filter.</p>}
    <PlacementForm key={`${selected}-${version}`} entries={entries} selected={selected} data={data} semesterId={semester.id} disabled={pending || stale} onSelect={setSelected} onSave={move} onRemove={p => { setSelected(""); command("save", entries.filter(e => e.seriesId !== p.seriesId)); }} />
    <section className="schedule-panel" aria-labelledby="publication-heading"><h2 id="publication-heading" className="text-lg font-semibold">Preview and publish</h2><p className="my-3">Publication applies from the effective date through {semester.endDate}, skips holidays, and preserves history. Planned classes are not delivered classes.</p><div className="flex flex-wrap items-end gap-4"><label className="grid gap-2">Draft effective from<Input disabled={pending || stale} type="date" min={semester.startDate > today ? semester.startDate : today} max={semester.endDate} value={effectiveFrom} onChange={e => { setEffectiveFrom(e.target.value); setPreview(null); }} /></label><Button variant="secondary" disabled={pending || stale} onClick={() => command("save")}>{pending ? "Working…" : "Save draft"}</Button><Button disabled={pending || stale || effectiveFrom !== savedDate} onClick={() => command("preview")}>Preview publication</Button></div>{effectiveFrom !== savedDate && <p className="mt-2">Save the changed effective date before previewing.</p>}
      {preview && <section aria-label="Publication preview" className="mt-6"><h3 className="text-lg font-semibold">Review {preview.count} dated classes</h3><p>{preview.effectiveFrom} to {preview.effectiveTo} · revision {preview.revision}. {preview.cancelledCount} future records replaced or cancelled; {preview.preservedCount} active records preserved. {preview.recipientCount} in-app recipients.</p><p className="my-3">Review each before/after change below. This preview reserves nothing.</p><ol className="preview-list" tabIndex={0} aria-label="Before and after changes">{preview.changes.map((c, i) => <li key={i} className="border-b border-border-subtle py-3"><p><strong>Before:</strong> {c.before}</p><p><strong>After:</strong> {c.after}</p></li>)}</ol><Button className="mt-4" disabled={pending || stale} onClick={() => command("publish")}>{pending ? "Publishing…" : `Publish ${preview.count} classes`}</Button></section>}
    </section>
  </section>;
}
function PlacementForm({ entries, selected, data, semesterId, disabled, onSelect, onSave, onRemove }: { entries: Placement[]; selected: string; data: SchedulingData; semesterId: string; disabled: boolean; onSelect: (id: string) => void; onSave: (p: Placement) => void; onRemove: (p: Placement) => void }) {
  const current = entries.find(e => e.seriesId === selected);
  const [allocationId, setAllocation] = useState(current?.allocationId ?? ""), [roomId, setRoom] = useState(current?.roomId ?? ""), [day, setDay] = useState(current?.weekday ?? 1), [start, setStart] = useState(current ? String(current.startMinute) : ""), [end, setEnd] = useState(current ? String(current.endMinute) : "");
  const newSeries = useRef<string | null>(null), classControl = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (current) classControl.current?.focus(); }, [current]);
  const slots = data.slots.filter(s => !s.archived && s.weekday === day).sort((a, b) => a.startMinute - b.startMinute);
  const label = (allocationId: string) => { const a = data.allocations.find(a => a.id === allocationId); return `${data.courses.find(c => c.id === a?.courseId)?.code} · ${data.sections.find(s => s.id === a?.sectionId)?.code} · ${data.faculty.find(f => f.id === a?.facultyId)?.name}`; };
  return <section className="schedule-panel" aria-labelledby="move-class-heading"><h2 id="move-class-heading" tabIndex={-1} className="text-lg font-semibold">Move class / Place class</h2><p className="my-3 text-text-secondary">Use these controls with keyboard or touch. A rejected placement retains your input and the saved class stays in its original position.</p><form onSubmit={e => { e.preventDefault(); if (!newSeries.current) newSeries.current = crypto.randomUUID(); onSave({ seriesId: current?.seriesId ?? newSeries.current, allocationId, roomId, weekday: day, startMinute: Number(start), endMinute: Number(end) }); }}><fieldset disabled={disabled} className="schedule-form">
    <label>Class to move<select ref={classControl} aria-label="Class to move" className="input" value={selected} onChange={e => onSelect(e.target.value)}><option value="">Place a new class</option>{entries.map(p => <option key={p.seriesId} value={p.seriesId}>{label(p.allocationId)} · {days[p.weekday]} {clockTime(p.startMinute)}</option>)}</select></label>
    <label>Allocation<select aria-label="Allocation" className="input" required value={allocationId} disabled={!!current} onChange={e => setAllocation(e.target.value)}><option value="">Choose allocation</option>{data.allocations.filter(a => !a.archived && a.semesterId === semesterId).map(a => <option key={a.id} value={a.id}>{label(a.id)}</option>)}</select></label>
    <label>Day<select aria-label="Day" className="input" value={day} onChange={e => { setDay(Number(e.target.value)); setStart(""); setEnd(""); }}>{[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{days[d]}</option>)}</select></label>
    <label>Start slot<select aria-label="Start slot" className="input" required value={start} onChange={e => setStart(e.target.value)}><option value="">Choose start</option>{slots.map(s => <option key={s.id} value={s.startMinute}>{clockTime(s.startMinute)} · {s.label}</option>)}</select></label>
    <label>End slot<select aria-label="End slot" className="input" required value={end} onChange={e => setEnd(e.target.value)}><option value="">Choose end</option>{slots.map(s => <option key={s.id} value={s.endMinute}>{clockTime(s.endMinute)} · {s.label}</option>)}</select></label>
    <label>Room<select aria-label="Room" className="input" required value={roomId} onChange={e => setRoom(e.target.value)}><option value="">Choose room</option>{data.rooms.filter(r => !r.archived).map(r => <option key={r.id} value={r.id}>{r.code} · {r.type} · {r.capacity} seats</option>)}</select></label>
    <div className="flex flex-wrap gap-3"><Button type="submit">{disabled ? "Working…" : current ? "Move class" : "Place class"}</Button>{current && <Button variant="secondary" onClick={() => onRemove(current)}>Remove from draft</Button>}</div>
  </fieldset></form></section>;
}
