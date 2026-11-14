import { describe, expect, it } from "vitest";
import { ledgerMinutes, type LedgerObligation } from "@/domain/delivery/ledger";
import { deliveryCommand } from "@/features/delivery/schema";
const now = "2026-11-14T10:00:00.000Z";
const unit = (id: string, dueAt = "2026-11-15T10:00:00.000Z"): LedgerObligation => ({ id, requiredMinutes: 60, dueAt, records: [], occurrences: [{ schedulingStatus: "ACTIVE", deliveryStatus: "PENDING", endAt: dueAt }] });
describe("obligation ledger", () => {
  it("keeps future requirements outstanding but not overdue and includes unmaterialized requirements", () => {
    expect(ledgerMinutes(240, [unit("one")], now)).toEqual({ required: 240, delivered: 0, planned: 60, outstanding: 240, overdue: 0 });
  });
  it("uses the original end boundary even when recovery is planned in the future", () => {
    const o = unit("one", now); o.occurrences.push({ schedulingStatus: "ACTIVE", deliveryStatus: "PENDING", endAt: "2026-11-16T10:00:00.000Z" });
    expect(ledgerMinutes(60, [o], now)).toMatchObject({ delivered: 0, overdue: 60, planned: 60 });
  });
  it("counts unique obligations once across original, makeup, duplicate inputs and retired records", () => {
    const o = unit("one", now); o.records = [{ current: false, status: "HELD", confirmedMinutes: 60 }, { current: true, status: "HELD", confirmedMinutes: 60 }, { current: true, status: "HELD", confirmedMinutes: 60 }];
    expect(ledgerMinutes(60, [o, o], now)).toMatchObject({ delivered: 60, outstanding: 0, overdue: 0, planned: 0 });
  });
  it("reverses credit using authoritative current records and floors outstanding", () => {
    const o = unit("one", now); o.records = [{ current: false, status: "HELD", confirmedMinutes: 60 }, { current: true, status: "NOT_HELD", confirmedMinutes: 0 }];
    expect(ledgerMinutes(60, [o], now)).toMatchObject({ delivered: 0, overdue: 60 });
    o.records = [{ current: true, status: "HELD", confirmedMinutes: 60 }];
    expect(ledgerMinutes(30, [o], now).outstanding).toBe(0);
  });
  it("ignores pending, not-held and cancelled plans for credit", () => {
    const o = unit("one", now); o.occurrences[0].schedulingStatus = "CANCELLED";
    expect(ledgerMinutes(60, [o], now)).toMatchObject({ delivered: 0, planned: 0, overdue: 60 });
  });
  it("requires reason and exact record identity for corrections and rejects client minutes/identity", () => {
    const c = { operation: "correct", occurrenceId: "a", status: "HELD", expectedRecordId: "old", reason: "   ", requestId: "b15e25cf-52c3-4160-84a4-224be5e541d1" };
    expect(deliveryCommand.safeParse(c).success).toBe(false);
    expect(deliveryCommand.safeParse({ ...c, reason: "Corrected after review" }).success).toBe(true);
    expect(deliveryCommand.safeParse({ ...c, reason: "Review", confirmedMinutes: 60 }).success).toBe(false);
    expect(deliveryCommand.safeParse({ ...c, reason: "Review", actorId: "other" }).success).toBe(false);
  });
});
