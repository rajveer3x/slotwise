import { candidateId, type Candidate } from "@/domain/resolution/engine";

/** The engine's canonical identity includes tier, obligation, course, faculty, room and exact interval. */
export function exactCandidate(candidate: Candidate, canonicalId: string | null) {
  return candidate.id === canonicalId && candidate.id === candidateId(candidate.tier, candidate.assignments);
}
export function invitationExpiry(now: Date, start: Date, hours = 24) {
  return new Date(Math.min(now.getTime() + hours * 3600000, start.getTime()));
}
export function coverState<T extends string>(status: T, expiresAt: Date, now: Date): T | "EXPIRED" {
  return status === "PENDING" && now >= expiresAt ? "EXPIRED" : status;
}
