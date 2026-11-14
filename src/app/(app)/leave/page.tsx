import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readLeaveWorkspace } from "@/server/services/leave";
import { LeaveWorkspaceView } from "@/features/leave/components";
export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const request = Array.isArray(query.request) ? query.request[0] : query.request;
  let workspace;
  try { workspace = await readLeaveWorkspace(actor.id, request);  } catch (error) {
    if (error instanceof AccessError) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-4">This leave request or workspace is not available to your account.</p></main>;
    throw error;
  }
  return <main id="main-content" tabIndex={-1} className="app-content"><p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata · Synthetic demo</p><h1 className="text-2xl font-semibold md:text-[28px]">Leave &amp; impact</h1><p className="mt-3">Full-day leave uses inclusive local dates. Previews are provisional; approval checks the current dated timetable.</p><LeaveWorkspaceView workspace={workspace} /></main>;
}
