import { describe, expect, it } from "vitest";
import { coverState, exactCandidate, invitationExpiry } from "@/domain/covers/consent";
import { candidateId, type Assignment, type Candidate } from "@/domain/resolution/engine";
const a: Assignment = { occurrenceId: "o", obligationId: "unit", allocationId: "allocation", facultyId: "f", sectionId: "s", roomId: "r", date: "2099-01-05", startMinute: 540, endMinute: 600 };
const c: Candidate = { id: candidateId(1, [a]), tier: 1, assignments: [a], removes: [a.occurrenceId], score: 0, contributions: [], why: "Synthetic", requires: "Accept" };
describe("exact consent and server deadlines", () => {
  it("expires at the exact boundary, not one millisecond before; final responses remain historical", () => {
    const expiry = new Date("2099-01-05T03:30:00Z");
    expect(coverState("PENDING", expiry, new Date(expiry.getTime() - 1))).toBe("PENDING");
    expect(coverState("PENDING", expiry, expiry)).toBe("EXPIRED");
    expect(coverState("ACCEPTED", expiry, expiry)).toBe("ACCEPTED");
  });
  it("defaults to 24 hours, permits configured windows and caps at start", () => {
    const now = new Date("2099-01-01T00:00:00Z"), start = new Date("2099-01-03T00:00:00Z");
    expect(invitationExpiry(now, start).toISOString()).toBe("2099-01-02T00:00:00.000Z");
    expect(invitationExpiry(now, start, 72)).toEqual(start);
    expect(invitationExpiry(now, start, 1).getTime() - now.getTime()).toBe(3600000);
  });
  it("binds every assignment identity, destination and tier, including tampered payloads carrying an old id", () => {
    expect(exactCandidate(c, c.id)).toBe(true);
    for (const change of [{ roomId: "another" }, { facultyId: "other" }, { startMinute: 600 }, { date: "2099-01-06" }, { endMinute: 660 }, { obligationId: "other" }, { sectionId: "other" }, { allocationId: "other" }]) {
      const assignments = [{ ...a, ...change }];
      expect(exactCandidate({ ...c, assignments }, c.id)).toBe(false);
      expect(exactCandidate({ ...c, assignments, id: candidateId(1, assignments) }, c.id)).toBe(false);
    }
    expect(exactCandidate({ ...c, tier: 5 }, c.id)).toBe(false);
  });
});
