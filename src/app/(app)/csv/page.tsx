import Link from "next/link";
import { requirePageSession } from "@/server/auth/page-session";
import { getDb } from "@/server/db";
import { localDate } from "@/domain/scheduling/timetable";
import { CsvWorkspace } from "@/features/csv/workspace";

export default async function CsvPage({ searchParams }: { searchParams: Promise<{ semester?: string }> }) {
  const actor = await requirePageSession();
  if (!["ADMIN", "COORDINATOR"].includes(actor.role)) {
    return <main id="main-content" tabIndex={-1} className="app-content">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="mt-4">CSV tools require a department administrator or coordinator.</p>
    </main>;
  }

  const semesters = await getDb().semester.findMany({
    where: { departmentId: actor.departmentId, archived: false },
    orderBy: [{ active: "desc" }, { startDate: "desc" }],
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  const query = await searchParams;
  return <main id="main-content" tabIndex={-1} className="app-content">
    <h1 className="text-2xl font-semibold md:text-[28px]">CSV import and export</h1>
    <p className="mt-2 text-text-secondary">{actor.department.name} · {actor.department.timezone}</p>
    <nav aria-label="Related pages" className="mt-4 flex flex-wrap gap-4">
      <Link className="inline-link" href="/admin">Master data</Link>
      <Link className="inline-link" href="/timetable">Timetable</Link>
    </nav>
    <CsvWorkspace semesters={semesters} initialSemester={query.semester} today={localDate()} />
  </main>;
}
