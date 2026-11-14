"use server";

import { sessionIdentity } from "@/server/auth/session";
import { checkSimulation, runSimulation } from "@/server/services/simulation";

export async function computeSimulation(input: unknown) {
  return runSimulation(await sessionIdentity(), input);
}

export async function refreshSimulationBaseline(input: unknown) {
  return checkSimulation(await sessionIdentity(), input);
}
