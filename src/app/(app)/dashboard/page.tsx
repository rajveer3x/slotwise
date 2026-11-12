import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
const descriptions = {
  ADMIN: "Manage access to your department's demo accounts.",
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
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface-subtle p-6" aria-labelledby="workspace-status"><h2 id="workspace-status" className="text-lg font-semibold">Your account is ready</h2><p className="mt-2 text-text-secondary">Timetable, semester and teaching data have not been set up. Scheduling workflows will be added in later features.</p>{user.role === "ADMIN" && <Link href="/admin" className="inline-link mt-4 inline-block">Manage account access</Link>}</section>
    <p className="mt-6 text-sm text-text-secondary">Synthetic demo identities. No live university records.</p>
  </main>;
}
