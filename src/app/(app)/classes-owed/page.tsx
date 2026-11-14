import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readLedger } from "@/server/services/delivery";
import { DeliveryView } from "@/features/delivery/components";
export default async function ClassesOwedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const semester = Array.isArray(query.semester) ? query.semester[0] : query.semester;
  let workspace;
  try { workspace = await readLedger(actor.id, semester); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
  }
  if (workspace) return <main id="main-content" tabIndex={-1} className="app-content"><p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata · Synthetic demo</p><h1 className="text-2xl font-semibold">Classes owed</h1><p className="page-description">Semester requirements, unique delivered minutes and future planned coverage.</p><DeliveryView workspace={workspace} ledger /></main>;
  return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p>The ledger is available to your department coordinator, HoD and administrator.</p></main>;
}
