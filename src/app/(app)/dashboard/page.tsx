import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
const descriptions = {
  ADMIN: "Manage your department's teaching records and demo account access.",
  COORDINATOR: "Your workspace for coordinating departmental schedules and recovery.",
  HOD: "Your workspace for reviewing departmental leave and exceptions.",
  FACULTY: "Your workspace for personal teaching commitments and leave.",
  STUDENT: "Your workspace for your section's timetable and schedule changes.",
};
export default async function DashboardPage() {
  const user = await requirePageSession();
  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="mb-2 text-sm text-text-secondary">{user.department.name} · {user.role}</p>
    <h1 className="text-2xl font-semibold md:text-[28px]">Welcome, {user.name}</h1>
    <p className="mt-4">{descriptions[user.role]}</p>
    <p className="mt-4 text-sm text-text-secondary">Institution timezone: {user.department.timezone}</p>
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface-subtle p-6" aria-labelledby="workspace-status"><h2 id="workspace-status" className="text-lg font-semibold">Your account is ready</h2><p className="mt-2 text-text-secondary">Your published timetable is available. Administrators and coordinators can edit weekly drafts, review conflicts and publish dated classes. Faculty can request leave and preview its impact; departmental HoDs review requests against the current dated schedule.</p>{["FACULTY", "HOD", "COORDINATOR", "ADMIN"].includes(user.role) && <Link href="/leave" className="inline-link mt-4 mr-4 inline-block">Leave &amp; impact</Link>}<Link href="/timetable" className="inline-link mt-4 mr-4 inline-block">View timetable</Link>{["ADMIN", "COORDINATOR"].includes(user.role) && <Link href="/admin" className="inline-link mt-4 inline-block">Manage master data</Link>}</section>
    <p className="mt-6 text-sm text-text-secondary">Synthetic demo identities. No live university records.</p>
  </main>;
}
