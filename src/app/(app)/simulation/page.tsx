import { SimulationWorkspace } from "@/features/simulation/workspace";
import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readSimulationWorkspace } from "@/server/services/simulation";

export default async function SimulationPage() {
  const actor = await requirePageSession();
  let workspace;
  try {
    workspace = await readSimulationWorkspace(actor.id, actor.departmentId);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <main id="main-content" tabIndex={-1} className="app-content">
      <h1>Simulation unavailable</h1>
      <p className="mt-3">Your account cannot access this workspace.</p>
    </main>;
  }

  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="mb-2 text-sm text-text-secondary">{actor.department.name} · Asia/Kolkata</p>
    <h1>What-if simulation</h1>
    <p className="page-description">Compare a hypothetical room closure or faculty absence against the published timetable.</p>
    <SimulationWorkspace {...workspace} />
  </main>;
}
