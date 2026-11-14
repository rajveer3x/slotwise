import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readCoverWorkspace } from "@/server/services/covers";
import { CoverWorkspaceView } from "@/features/covers/components";
export default async function CoverRequestsPage() {
  const actor = await requirePageSession();
  let workspace;
  try { workspace = await readCoverWorkspace(actor.id); }
  catch (error) {
    if (error instanceof AccessError) return <main id="main-content" tabIndex={-1} className="app-content"><h1>Access denied</h1><p className="mt-4">Cover responses and exceptions are available to authorized staff only.</p></main>;
    throw error;
  }
  return <main id="main-content" tabIndex={-1} className="app-content"><p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata</p><h1>Cover & exceptions</h1><p className="page-description">Respond to your exact cover invitations or review Saturday exceptions. Cover acceptance and HoD approval require a separate validated schedule publication.</p><CoverWorkspaceView workspace={workspace} /></main>;
}
