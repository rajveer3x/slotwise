import "server-only";
import { candidateId, type Assignment, type Candidate, type ResolutionSnapshot } from "@/domain/resolution/engine";
import { exactCandidate } from "@/domain/covers/consent";
import { ScheduleError, type Tx } from "./scheduling-store";

export type Fallback = { candidate: Candidate | null; searchComplete: boolean; sourceResolved: boolean };
export const liveEmergency = { status: { in: ["OPEN", "WON"] as ("OPEN" | "WON")[] } };
export const emergencyWorkerActor = "slotwise-emergency-worker";
export const isCoordinator = (role: string) => role === "COORDINATOR";

export function skipEmergencySubstitutes(original: Assignment, snapshot: ResolutionSnapshot) {
  return snapshot.data.faculty.map(f => ({
    candidateId: candidateId(1, [{ ...original, facultyId: f.id }]),
    reason: "The emergency round expired without a substitute.",
  }));
}

// An open round, or exact winning offer owned by a different coordinator,
// cannot be bypassed through a saved draft or a standard cover invitation.
export async function emergencyPublicationConsent(tx: Tx, departmentId: string, actor: { id: string; role: string }, candidate: Candidate) {
  const round = await tx.emergencyRound.findFirst({
    where: { departmentId, occurrenceId: candidate.assignments[0].occurrenceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { winner: true },
  });
  if (!round) return null;
  if (!isCoordinator(actor.role)) throw new ScheduleError("CONFLICT", "Emergency recovery requires publication by a departmental coordinator.");
  if (round.status === "EXPIRED" || round.status === "CANCELLED") return null;
  if (round.status === "OPEN") throw new ScheduleError("CONFLICT", "The emergency round is pending. Wait for acceptance or expiry, or cancel the round.");
  if (round.createdById !== actor.id || candidate.tier !== 1 || !round.winner || !exactCandidate(round.winner.candidate as unknown as Candidate, candidate.id)) {
    throw new ScheduleError("CONFLICT", "Use the exact emergency winner in the launching coordinator’s draft, or cancel the round to review another option.");
  }
  return round.id;
}
