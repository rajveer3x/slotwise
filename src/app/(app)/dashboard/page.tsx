import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
import { readTimetable } from "@/server/services/timetable";
import { readLeaveWorkspace } from "@/server/services/leave";
import { getDb } from "@/server/db";
import { addDays, clockTime, weekOf } from "@/domain/scheduling/timetable";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CalendarOff, Clock3, GraduationCap, Layers2, MoveUpRight, Sparkles, Waypoints } from "lucide-react";
const descriptions = {
  ADMIN: "Manage your department's teaching records and demo account access.",
  COORDINATOR: "Your workspace for coordinating departmental schedules and recovery.",
  HOD: "Your workspace for reviewing departmental leave and exceptions.",
  FACULTY: "Your workspace for personal teaching commitments and leave.",
  STUDENT: "Your workspace for your section's timetable and schedule changes.",
};
export default async function DashboardPage() {
  const user = await requirePageSession();
  const staff = user.role !== "STUDENT", canManage = ["ADMIN", "COORDINATOR"].includes(user.role);
  const [schedule, leave, profile] = await Promise.all([
    readTimetable(user.id),
    staff ? readLeaveWorkspace(user.id) : Promise.resolve(null),
    user.role === "FACULTY" ? getDb().faculty.findFirst({ where: { departmentId: user.departmentId, userId: user.id }, select: { id: true } }) : Promise.resolve(null),
  ]);
  const records = schedule.occurrences.filter(o => user.role !== "FACULTY" || o.facultyId === profile?.id);
  const active = records.filter(o => o.schedulingStatus === "ACTIVE");
  const week = weekOf(schedule.today), weekRows = active.filter(o => o.localDate >= week && o.localDate <= addDays(week, 6));
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const currentMinute = clock[0] * 60 + clock[1];
  const next = active.filter(o => o.localDate > schedule.today || (o.localDate === schedule.today && o.startMinute >= currentMinute)).slice(0, 4);
  const pending = leave?.requests.filter(r => r.status === "SUBMITTED").length ?? 0;
  const approved = leave?.requests.filter(r => r.status === "APPROVED").length ?? 0;
  const sections = new Set(active.map(o => o.sectionId)).size;
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${schedule.today}T12:00:00+05:30`));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label, i) => ({ label, count: weekRows.filter(o => o.localDate === addDays(week, i)).length }));
  const maximum = Math.max(1, ...days.map(d => d.count));
  return <main id="main-content" tabIndex={-1} className="app-content">
    <div className="dashboard-heading"><div><p className="eyebrow">YOUR ACADEMIC OVERVIEW</p><h1>Welcome, {user.name}</h1><p className="page-description">{descriptions[user.role]}</p></div><span className="date-pill"><CalendarDays size={16} aria-hidden="true" />{date}</span></div>
    <div className="dashboard-stats">
      <section className="stat-card"><span className="stat-icon lavender"><CalendarDays size={20} aria-hidden="true" /></span><p>Scheduled classes</p><div><strong>{active.length}</strong><span className="stat-chip">This semester</span></div><small>{schedule.semester?.name ?? "No semester configured"}</small></section>
      <section className="stat-card"><span className="stat-icon lime"><Clock3 size={20} aria-hidden="true" /></span><p>This week</p><div><strong>{weekRows.length}</strong><span className="stat-chip">Mon — Fri</span></div><small>Published classes · week of {week}</small></section>
      <section className="stat-card"><span className="stat-icon peach">{staff ? <CalendarOff size={20} aria-hidden="true" /> : <GraduationCap size={20} aria-hidden="true" />}</span><p>{staff ? "Pending leave" : "Your sections"}</p><div><strong>{staff ? pending : sections}</strong><span className="stat-chip">{staff ? "Awaiting review" : "In your schedule"}</span></div><small>{user.role === "FACULTY" ? "Your submitted requests" : staff ? "Department submitted requests" : "From your published timetable"}</small></section>
    </div>
    <div className="dashboard-grid">
      <section className="overview-card"><div className="card-heading"><span className="card-icon"><Layers2 size={19} aria-hidden="true" /></span><h2>Your schedule, at a glance</h2><Link href="/timetable" className="icon-link" aria-label="Open timetable"><ArrowUpRight size={20} /></Link></div><p className="card-subtitle">A little structure for everything ahead.</p><div className="schedule-bubbles" aria-label={`${active.length} active classes, ${records.length - active.length} cancelled classes, ${sections} scheduled sections`}><div className="bubble bubble-lavender"><strong>{active.length}</strong><span>active classes</span></div><div className="bubble bubble-dark"><strong>{records.length - active.length}</strong><span>cancelled</span></div><div className="bubble bubble-lime"><strong>{sections}</strong><span>sections</span></div></div><div className="schedule-summary"><span><i className="legend-dot lavender" />Published schedule</span><strong>{schedule.semester ? `Revision ${schedule.semester.scheduleRevision}` : "Not published"}</strong></div><p className="card-subtitle">Counts reflect your accessible semester timetable. Scheduled classes are separate from delivered teaching.</p><Link className="card-text-link" href="/timetable">View timetable <ArrowRight size={17} aria-hidden="true" /></Link></section>
      <section className="agenda-card"><div className="card-heading"><span className="card-icon"><Clock3 size={19} aria-hidden="true" /></span><h2>Coming up next</h2><span className="small-tag">Agenda</span></div>{next.length ? <ol className="agenda-list">{next.map((o, i) => <li key={o.id}><span className={`agenda-marker ${i % 2 ? "lime" : "lavender"}`} aria-hidden="true" /><div><span className="agenda-time">{o.localDate} · {clockTime(o.startMinute)}–{clockTime(o.endMinute)}</span><h3>{o.course}</h3><p>{o.section} · {o.room} · {o.faculty}</p></div></li>)}</ol> : <div className="agenda-empty"><span className="empty-calendar"><CalendarDays size={29} aria-hidden="true" /></span><h3>A little breathing room.</h3><p>No upcoming published classes in this view. Your schedule will appear here once classes are published.</p><Link href="/timetable" className="card-text-link">Explore timetable <ArrowUpRight size={16} aria-hidden="true" /></Link></div>}</section>
      <section className="week-card"><div className="card-heading"><span className="card-icon"><MoveUpRight size={19} aria-hidden="true" /></span><h2>The rhythm of your week</h2><span className="small-tag">This week</span></div><div className="week-total"><strong>{weekRows.length}</strong><span>scheduled classes<br /><small>Asia/Kolkata</small></span></div><div className="week-chart" role="img" aria-label={`Scheduled classes this week: ${days.map(d => `${d.label} ${d.count}`).join(", ")}`} aria-describedby="week-counts">{days.map((d, i) => <div className="week-column" key={d.label}><span className="bar-value">{d.count}</span><div className="bar-track"><span className={`week-bar ${i % 2 ? "lavender" : "lime"}`} style={{ height: d.count ? `${Math.max(8, d.count / maximum * 100)}%` : "3px" }} /></div><span>{d.label}</span></div>)}</div><p id="week-counts" className="sr-only">{days.map(d => `${d.label}: ${d.count}`).join("; ")}. Counts are scheduled classes, not attendance.</p></section>
      <section className="recovery-card"><div className="card-heading"><span className="card-icon"><Waypoints size={19} aria-hidden="true" /></span><h2>{staff ? "Room for change" : "Your campus workspace"}</h2><Sparkles size={18} aria-hidden="true" /></div><p>{staff ? "When plans change, a considered next step makes all the difference." : "Keep your academic week close. See the latest published times, sections and rooms."}</p>{staff && <div className="recovery-numbers"><div><strong>{pending}</strong><span>Pending leave</span></div><div><strong>{approved}</strong><span>Approved leave</span></div></div>}<Link href={canManage ? "/resolutions" : staff ? "/leave" : "/timetable"} className="recovery-link">{canManage ? "Compare leave resolutions and save a draft" : staff ? "Leave & impact" : "Open your timetable"}<ArrowUpRight size={18} aria-hidden="true" /></Link><span className="recovery-note">{staff ? "Recovery choices remain drafts until reviewed and published." : "Lovely Professional University · Academic project"}</span></section>
    </div>
    <footer className="dashboard-footnote"><span>Lovely Professional University <span aria-hidden="true">↗</span></span><span>Synthetic demo identities. No live university records. · {user.department.timezone}</span>{canManage && <Link href="/admin">Manage master data <ArrowDownLeft size={14} aria-hidden="true" /></Link>}</footer>
  </main>;
}
