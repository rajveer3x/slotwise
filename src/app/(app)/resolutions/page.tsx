import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readResolutionWorkspace } from "@/server/services/resolutions";
import { ResolutionWorkspaceView } from "@/features/resolutions/components";
export default async function ResolutionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const leaveId = Array.isArray(query.leave) ? query.leave[0] : query.leave;
  let workspace;
  try { workspace = await readResolutionWorkspace(actor.id, leaveId); }
  catch (error) {
    if (error instanceof AccessError) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-4">Resolution drafts are available to your department coordinator and administrator only.</p></main>;
    throw error;
  }
  return <main id="main-content" tabIndex={-1} className="app-content"><p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata · Synthetic demo</p><h1 className="text-2xl font-semibold md:text-[28px]">Leave resolutions</h1><p className="mt-3">Compare explainable recovery options and save your own draft. Drafts reserve nothing. Invite saved substitutes and request exact Saturday approval. Responses reserve nothing. Review Before / After changes below, then publish a validated saved subset.</p><ResolutionWorkspaceView workspace={workspace} /></main>;
}
