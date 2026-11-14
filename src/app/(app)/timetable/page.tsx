import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readTimetable } from "@/server/services/timetable";
import { GenerationPanel } from "@/features/timetable/generation-panel";
import { CreateDraft, DraftEditor } from "@/features/timetable/components";
import { addDays, clockTime, days, localDate, weekday, weekOf } from "@/domain/scheduling/timetable";
import { Button } from "@/components/ui/button";
export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const param = (key: string) => { const value = query[key]; return Array.isArray(value) ? value[0] : value; };
  let snapshot;
  try { snapshot = await readTimetable(actor.id, param("semester")); }
  catch (error) { if (error instanceof AccessError) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p>This semester is not available in your department.</p></main>; throw error; }
  const { semester, data } = snapshot;
  if (!semester) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Timetable</h1><p className="mt-4">No semester is configured. Ask your coordinator to create semester and teaching records in Master data.</p></main>;
  const draft = snapshot.drafts.find(d => d.id === param("draft"));
  const view = actor.role === "STUDENT" ? "section" : ["section", "faculty", "room"].includes(param("view") ?? "") ? param("view")! : "section";
  const resource = param("resource") ?? "";
  const source = data ? view === "room" ? data.rooms.map(r => [r.id, r.code]) : view === "faculty" ? data.faculty.map(f => [f.id, f.name]) : data.sections.map(s => [s.id, s.code]) : snapshot.occurrences.map(o => view === "room" ? [o.roomId ?? "online", o.room] : view === "faculty" ? [o.facultyId, o.faculty] : [o.sectionId, o.section]);
  const options = [...new Map(source.map(([id, label]) => [id, label])).entries()];
  const requested = param("week");
  const validDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && !isNaN(new Date(`${requested}T00:00:00Z`).getTime());
  const week = weekOf(validDate ? requested : localDate() < semester.startDate ? semester.startDate : localDate() > semester.endDate ? semester.endDate : localDate());
  const rows = snapshot.occurrences.filter(o => o.localDate >= week && o.localDate <= addDays(week, 6) && (param("cancelled") === "on" || o.schedulingStatus === "ACTIVE") && (!resource || (view === "room" ? (o.roomId ?? "online") : view === "faculty" ? o.facultyId : o.sectionId) === resource));
  const teachingDays = rows.some(o => weekday(o.localDate) === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const weekHref = (offset: number) => `/timetable?${new URLSearchParams({ semester: semester.id, view, resource, week: addDays(week, offset) })}`;
  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata · Synthetic demo</p><h1 className="text-2xl font-semibold md:text-[28px]">Timetable</h1><p className="mt-3">{semester.name} · {draft ? "Draft — not reserved" : "Published schedule"} · Revision {semester.scheduleRevision}</p>
    <form className="schedule-panel my-6 schedule-form" method="get" aria-label="Timetable filters">
      <label>Semester<select aria-label="Semester" name="semester" className="input" defaultValue={semester.id}>{snapshot.semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {snapshot.canEdit && <label>Schedule<select aria-label="Schedule" name="draft" className="input" defaultValue={draft?.id ?? ""}><option value="">Published schedule</option>{snapshot.drafts.map((d, i) => <option key={d.id} value={d.id}>Draft {i + 1} · from {d.effectiveFrom} · v{d.version}</option>)}</select></label>}
      {actor.role !== "STUDENT" && <label>View by<select aria-label="View by" name="view" className="input" defaultValue={view}><option value="section">Section</option><option value="faculty">Faculty</option><option value="room">Room</option></select></label>}
      <label>Resource<select aria-label="Resource" name="resource" className="input" defaultValue={resource}><option value="">All {view === "faculty" ? "faculty" : `${view}s`}</option>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {!draft && <><label>Week containing<input name="week" type="date" className="input" defaultValue={week} /></label><label className="flex items-center gap-2"><input name="cancelled" type="checkbox" defaultChecked={param("cancelled") === "on"} />Include cancelled classes</label></>}
      <div><Button type="submit" variant="secondary">Apply view</Button></div><p className="text-sm text-text-secondary">After changing View by, apply once to load that resource list.</p>
    </form>
    {param("draft") && !draft && <p className="my-4" role="status">This draft is no longer available. The published schedule is shown below.</p>}
    {draft && data ? <DraftEditor key={draft.id} draft={draft} data={data} semester={semester} today={snapshot.today} view={view} resource={resource} /> : <section aria-labelledby="week-heading">
      <div className="mb-4 flex flex-wrap items-center gap-4"><h2 id="week-heading" className="text-lg font-semibold">Week of {week}</h2><Link className="button button-secondary" href={weekHref(-7)}>Previous week</Link><Link className="button button-secondary" href={weekHref(7)}>Next week</Link></div>
      {!rows.length ? <p className="schedule-panel">No published classes match this week and view.{snapshot.canEdit ? " Create or select a draft to begin manual scheduling." : " Your coordinator publishes classes here."}</p> : <>
        <div className="timetable-desktop overflow-x-auto" role="region" aria-label="Published timetable grid; scroll horizontally for all weekdays" tabIndex={0}><table className="timetable-grid"><thead><tr><th scope="col">Time</th>{teachingDays.map(d => <th scope="col" key={d}>{days[d]}<br />{addDays(week, d - 1)}</th>)}</tr></thead><tbody>{[...new Set(rows.map(o => o.startMinute))].sort((a, b) => a - b).map(time => <tr key={time}><th scope="row">{clockTime(time)}</th>{teachingDays.map(d => <td key={d}>{rows.filter(o => o.startMinute === time && weekday(o.localDate) === d).map(o => <PublishedBlock key={o.id} occurrence={o} />)}</td>)}</tr>)}</tbody></table></div>
        <section className="timetable-mobile" aria-label="Published weekly agenda">{teachingDays.map(d => <div key={d} className="mb-4"><h3 className="mb-2 font-semibold">{days[d]} · {addDays(week, d - 1)}</h3>{rows.filter(o => weekday(o.localDate) === d).map(o => <PublishedBlock key={o.id} occurrence={o} />)}{!rows.some(o => weekday(o.localDate) === d) && <p>No published classes.</p>}</div>)}</section>
      </>}
    </section>}
    {snapshot.canEdit && <div className="mt-8 grid gap-6">
      {!draft && <GenerationPanel key={semester.id} semester={semester} today={snapshot.today}
        hasAllocations={!!data?.allocations.some(a => a.semesterId === semester.id && !a.archived)} />}
      <CreateDraft semester={semester} today={snapshot.today} />
    </div>}
  </main>;
}
function PublishedBlock({ occurrence: o }: { occurrence: Awaited<ReturnType<typeof readTimetable>>["occurrences"][number] }) {
  return <article className={`class-block ${o.schedulingStatus === "CANCELLED" ? "class-cancelled" : ""}`}><h3 className="font-semibold">{o.course}</h3><p>{clockTime(o.startMinute)}–{clockTime(o.endMinute)}</p><p>{o.faculty} · {o.section} · {o.room}</p>{o.resolutionTier && <p className="text-sm">{o.resolutionTier === 1 ? "Substitute assigned" : o.resolutionTier === 2 ? "Swapped" : "Rescheduled"} · Original {o.originalDate}</p>}{o.meetingUrl && <a className="inline-link break-all" href={o.meetingUrl} target="_blank" rel="noopener noreferrer">Open meeting</a>}<p className="text-sm">{o.schedulingStatus === "ACTIVE" ? "Published" : "Cancelled"} · Delivery: {o.deliveryStatus === "PENDING" ? "Pending" : o.deliveryStatus === "HELD" ? "Held" : "Not held"}</p></article>;
}
