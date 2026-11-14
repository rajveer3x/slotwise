import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readDeliveryWorkspace } from "@/server/services/delivery";
import { DeliveryView } from "@/features/delivery/components";
export default async function DeliveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const semester = Array.isArray(query.semester) ? query.semester[0] : query.semester;
  let workspace;
  try { workspace = await readDeliveryWorkspace(actor.id, semester); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
  }
  if (workspace) return <main id="main-content" tabIndex={-1} className="app-content"><p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata · Synthetic demo</p><h1 className="text-2xl font-semibold">Class delivery</h1><p className="page-description">Record held or not-held classes independently of scheduling.</p><DeliveryView workspace={workspace} /></main>;
  return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p>Delivery is available to assigned faculty and departmental staff.</p></main>;
}
