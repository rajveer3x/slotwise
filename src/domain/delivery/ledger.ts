export type LedgerObligation = {
  id: string; requiredMinutes: number; dueAt: string | null;
  records: { current: boolean; status: string; confirmedMinutes: number }[];
  occurrences: { schedulingStatus: string; deliveryStatus: string; endAt: string }[];
};
/** Stable obligation identity, never occurrence count, determines earned credit. */
export function ledgerMinutes(required: number, obligations: LedgerObligation[], now: string) {
  let delivered = 0, planned = 0, overdue = 0;
  for (const obligation of new Map(obligations.map(o => [o.id, o])).values()) {
    const earned = Math.min(obligation.requiredMinutes, Math.max(0, ...obligation.records.filter(r => r.current && r.status === "HELD").map(r => r.confirmedMinutes)));
    delivered += earned;
    if (!earned && obligation.occurrences.some(o => o.schedulingStatus === "ACTIVE" && o.deliveryStatus === "PENDING" && o.endAt > now)) planned += obligation.requiredMinutes;
    if (obligation.dueAt && obligation.dueAt <= now) overdue += Math.max(0, obligation.requiredMinutes - earned);
  }
  return { required, delivered, planned, outstanding: Math.max(0, required - delivered), overdue };
}
