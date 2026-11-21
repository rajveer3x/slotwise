import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readTimetable, type TimetableSnapshot } from "@/server/services/timetable";
import { GenerationPanel } from "@/features/timetable/generation-panel";
import { CreateDraft, DraftEditor } from "@/features/timetable/components";
import { PublishedTimetable, timetableDate } from "@/features/timetable/published-timetable";
import { addDays, weekOf } from "@/domain/scheduling/timetable";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const views = { section: "Section", faculty: "Faculty", room: "Room" } as const;
const overviewLabels = { section: "All sections", faculty: "All faculty", room: "All rooms" } as const;
type View = keyof typeof views;
type Occurrence = TimetableSnapshot["occurrences"][number];

function resourceFor(o: Occurrence, view: View): [string, string] {
  if (view === "room") return [o.roomId ?? "online", o.room];
  if (view === "faculty") return [o.facultyId, o.faculty];
  return [o.sectionId, o.section];
}

export default async function TimetablePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const param = (key: string) => { const value = query[key]; return Array.isArray(value) ? value[0] : value; };
  let snapshot;
  try { snapshot = await readTimetable(actor.id, param("semester")); }
  catch (error) { if (error instanceof AccessError) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p>This semester is not available in your department.</p></main>; throw error; }
  const { semester, data } = snapshot;
  if (!semester) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Timetable</h1><p className="mt-4">No semester is configured. Ask your coordinator to create semester and teaching records in Master data.</p></main>;

  const draft = snapshot.drafts.find(d => d.id === param("draft"));
  const student = actor.role === "STUDENT";
  const requestedView = param("view");
  const view = !student && (requestedView === "faculty" || requestedView === "room") ? requestedView : "section";
  const source: [string, string][] = draft && data
    ? view === "room" ? data.rooms.map(r => [r.id, r.code]) : view === "faculty" ? data.faculty.map(f => [f.id, f.name]) : data.sections.map(s => [s.id, s.code])
    : snapshot.occurrences.map(o => resourceFor(o, view));
  const options = [...new Map(source)].sort((a, b) => a[1].localeCompare(b[1], "en", { numeric: true }));
  const requestedResource = param("resource");
  const defaultSection = !draft && view === "section" ? options[0]?.[0] ?? "" : "";
  const selectedResource = options.find(([id]) => id === requestedResource);
  const resource = student ? "" : requestedResource === "" ? "" : selectedResource?.[0] ?? defaultSection;
  const label = options.find(([id]) => id === resource)?.[1];
  const scope = student ? (options[0] ? `Section ${options[0][1]}` : "Your section")
    : label ? (view === "faculty" || resource === "online" ? label : `${views[view]} ${label}`) : overviewLabels[view];

  const includeCancelled = param("cancelled") === "on";
  const visible = snapshot.occurrences.filter(o => (includeCancelled || o.schedulingStatus === "ACTIVE") && (!resource || resourceFor(o, view)[0] === resource));
  const requestedWeek = param("week");
  const validWeek = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) && !isNaN(new Date(`${requestedWeek}T00:00:00Z`).getTime());
  const currentWeek = weekOf(snapshot.today < semester.startDate ? semester.startDate : snapshot.today > semester.endDate ? semester.endDate : snapshot.today);
  const upcoming = visible.find(o => o.localDate >= snapshot.today && o.schedulingStatus === "ACTIVE");
  const hasClassesThisWeek = visible.some(o => o.localDate >= currentWeek && o.localDate <= addDays(currentWeek, 6));
  const week = validWeek ? weekOf(requestedWeek) : !hasClassesThisWeek && upcoming ? weekOf(upcoming.localDate) : currentWeek;
  const rows = visible.filter(o => o.localDate >= week && o.localDate <= addDays(week, 6));

  const publishedHref = (targetView: string, targetWeek: string, targetResource?: string) => {
    const params = new URLSearchParams({ semester: semester.id, view: targetView, week: targetWeek });
    if (targetResource !== undefined) params.set("resource", targetResource);
    if (includeCancelled) params.set("cancelled", "on");
    return `/timetable?${params}`;
  };

  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata · Synthetic demo</p>
    <h1 className="text-2xl font-semibold md:text-[28px]">Timetable</h1>
    <p className="mt-3">{semester.name} · {draft ? "Draft — not reserved" : "Published schedule"} · Revision {semester.scheduleRevision}</p>
    {snapshot.canEdit && <Link className="inline-link mt-4 inline-block" href={`/csv?${new URLSearchParams({ semester: semester.id })}`}>CSV import and export</Link>}

    {!draft && !student && <nav className="timetable-view-links mt-6" aria-label="Timetable views">
      {Object.entries(views).map(([mode, label]) => <Link key={mode} href={publishedHref(mode, week, mode === view ? resource : undefined)} aria-current={mode === view ? "page" : undefined} className={buttonClassName("secondary")}>{label}</Link>)}
    </nav>}
    <form key={`${semester.id}/${view}/${resource}/${week}/${includeCancelled}/${draft?.id ?? "published"}`} className={`schedule-panel my-6 schedule-form${draft ? "" : " published-timetable-filters"}`} method="get" action="/timetable" aria-label="Timetable filters">
      <label>Semester<select aria-label="Semester" name="semester" className="input" defaultValue={semester.id}>{snapshot.semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {snapshot.canEdit && <label>Schedule<select aria-label="Schedule" name="draft" className="input" defaultValue={draft?.id ?? ""}><option value="">Published schedule</option>{snapshot.drafts.map((d, i) => <option key={d.id} value={d.id}>Draft {i + 1} · from {d.effectiveFrom} · v{d.version}</option>)}</select></label>}
      {draft ? <label>View by<select aria-label="View by" name="view" className="input" defaultValue={view}>{Object.entries(views).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label> : <input type="hidden" name="view" value={view} />}
      {!student && <label>{draft ? "Resource" : views[view]}<select aria-label={draft ? "Resource" : views[view]} name="resource" className="input" defaultValue={resource}><option value="">{overviewLabels[view]}</option>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
      {!draft && <label>Week containing<Input name="week" type="date" defaultValue={week} /></label>}
      <Button type="submit" variant="secondary" className="justify-self-start">Apply view</Button>
      {draft ? <p className="text-sm text-text-secondary">After changing View by, apply once to load that resource list.</p> : <label className="timetable-cancelled-filter"><input name="cancelled" type="checkbox" defaultChecked={includeCancelled} />Include cancelled classes</label>}
    </form>

    {param("draft") && !draft && <p className="my-4" role="status">This draft is no longer available. The published schedule is shown below.</p>}
    {draft && data ? <DraftEditor key={draft.id} draft={draft} data={data} semester={semester} today={snapshot.today} view={view} resource={resource} /> : <section aria-labelledby="week-heading">
      <div className="published-week-heading">
        <div><h2 id="week-heading" className="text-lg font-semibold">{scope}</h2><p className="text-sm text-text-secondary">Week of <time dateTime={week}>{timetableDate(week, "long")}</time></p></div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonClassName("secondary")} href={publishedHref(view, addDays(week, -7), resource)}>Previous week</Link>
          <Link className={buttonClassName("secondary")} href={publishedHref(view, addDays(week, 7), resource)}>Next week</Link>
        </div>
      </div>
      {!student && view === "section" && !resource && options.length > 1 && <p className="mb-3 text-sm text-text-secondary">Classes from different sections can run at the same time.</p>}
      {rows.length ? <PublishedTimetable week={week} rows={rows} showSection={!student && (view !== "section" || !resource)} /> : <p className="schedule-panel">No published classes match this week and view.{snapshot.canEdit ? " Choose another week or select a draft to edit." : " Your coordinator publishes classes here."}</p>}
    </section>}

    {snapshot.canEdit && <div className="mt-8 grid gap-6">
      {!draft && <GenerationPanel key={semester.id} semester={semester} today={snapshot.today}
        hasAllocations={!!data?.allocations.some(a => a.semesterId === semester.id && !a.archived)} />}
      <CreateDraft semester={semester} today={snapshot.today} />
    </div>}
  </main>;
}
