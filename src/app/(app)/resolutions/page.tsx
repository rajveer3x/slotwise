import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readResolutionWorkspace } from "@/server/services/resolutions";
import { ResolutionWorkspaceView } from "@/features/resolutions/components";
import { latestMakeupPolls, readPollPreference } from "@/server/services/makeup-polls";
import { readEmergencyChoice } from "@/server/services/emergency-cover";
import { localDate } from "@/domain/scheduling/timetable";

export default async function ResolutionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePageSession(), query = await searchParams;
  const leaveId = Array.isArray(query.leave) ? query.leave[0] : query.leave;
  const pollId = Array.isArray(query.poll) ? query.poll[0] : query.poll;
  const roundId = typeof query.emergency === "string" ? query.emergency : undefined;
  let workspace;
  let preference, latestPolls, emergencyChoice;
  try {
    workspace = await readResolutionWorkspace(actor.id, leaveId);
    [preference, latestPolls, emergencyChoice] = await Promise.all([
      pollId && workspace.leaveId ? readPollPreference(actor.id, workspace.leaveId, pollId) : undefined,
      latestMakeupPolls(actor.id, workspace.board?.items.map(i => i.original.obligationId) ?? []),
      roundId && workspace.leaveId ? readEmergencyChoice(actor.id, workspace.leaveId, roundId) : null,
    ]);
  }
  catch (error) {
    if (error instanceof AccessError) return <main id="main-content" className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-4">Resolution drafts are available to your department coordinator and administrator only.</p></main>;
    throw error;
  }
  return <main id="main-content" tabIndex={-1} className="app-content"><p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata · Synthetic demo</p><h1 className="text-2xl font-semibold md:text-[28px]">Class recovery</h1><p className="mt-3">Compare explainable recovery options and save your own draft. Drafts reserve nothing. Invite saved substitutes and request exact Saturday approval. Responses reserve nothing. Review Before / After changes below, then publish a validated saved subset.</p><ResolutionWorkspaceView workspace={workspace} preference={preference} pollId={pollId} latestPolls={latestPolls} emergencyChoice={emergencyChoice} roundId={roundId} emergencyDate={actor.role === "COORDINATOR" && workspace.requests.some(r => r.id === workspace.leaveId) ? localDate() : undefined} /></main>;
}
