import { z } from "zod";
const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => { const d = new Date(`${value}T00:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }, "Choose a valid date.");
export const leaveDates = z.object({ semesterId: id, startDate: date, endDate: date }).strict();
export const leaveCommand = z.discriminatedUnion("operation", [
  leaveDates.extend({ operation: z.literal("submit"), requestId: z.uuid(), privateReason: z.string().trim().max(2000) }).strict(),
  z.object({ operation: z.enum(["approve", "reject", "withdraw"]), requestId: z.uuid(), leaveId: id, expectedVersion: z.number().int().positive(), rejectionReason: z.string().trim().max(2000).optional() }).strict(),
]);
export type ImpactClass = { id: string; date: string; startMinute: number; endMinute: number; minutes: number; course: string; section: string; room: string };
export type LeaveImpact = { classes: ImpactClass[]; minutes: number; revision: number; coverage?: { possible: number; unresolved: number; searchComplete: boolean; tiers: { tier: number; count: number }[] } };
export type LeaveResult = { ok: boolean; message: string; code?: string; fieldErrors?: Record<string, string[]>; leaveId?: string; impact?: LeaveImpact };
export const leaveLabels = { SUBMITTED: "Pending approval", APPROVED: "Approved leave", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };
