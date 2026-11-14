import Link from "next/link";
import { PollCard } from "@/features/makeup-polls/components";
import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readMakeupPolls } from "@/server/services/makeup-polls";

export default async function MakeupPollsPage({ searchParams }: { searchParams: Promise<{ poll?: string | string[] }> }) {
  const actor = await requirePageSession();
  const { poll } = await searchParams;
  const selected = Array.isArray(poll) ? poll[0] : poll;
  let workspace;
  try { workspace = await readMakeupPolls(actor.id, selected); }
  catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <main id="main-content" tabIndex={-1} className="app-content"><h1>Poll unavailable</h1><p className="mt-3">Your account cannot access this poll.</p></main>;
  }
  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata</p>
    <h1>Makeup polls</h1>
    <p className="page-description">Section representatives can share a preference. The coordinator publishes the makeup after reviewing current availability.</p>
    <div className="my-4 flex flex-wrap gap-4">
      {selected && <Link className="inline-link" href="/makeup-polls">All makeup polls</Link>}
      {workspace.manager && <Link className="inline-link" href="/resolutions">Open Class recovery</Link>}
    </div>
    <div className="mt-6 grid gap-5">
      {workspace.polls.map(row => <PollCard key={row.id} poll={row} manager={workspace.manager} />)}
      {!workspace.polls.length && <p className="schedule-panel">{workspace.manager
        ? "No makeup polls yet. Open one from a weekday candidate in Class recovery."
        : workspace.representative ? "No makeup polls for your section yet." : "Polls are available to designated section representatives."}</p>}
    </div>
  </main>;
}
