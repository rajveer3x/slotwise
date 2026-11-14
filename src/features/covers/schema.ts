import { z } from "zod";
import type { Assignment, Candidate, Rejection } from "@/domain/resolution/engine";
const id = z.string().min(1).max(100);
const request = { requestId: z.uuid() };
const selected = { ...request, leaveId: id, occurrenceId: id, candidateId: z.string().min(1).max(3000), expectedVersion: z.number().int().positive(), expectedToken: z.string().length(64) };
export const coverCommand = z.discriminatedUnion("operation", [
  z.object({ ...selected, operation: z.literal("invite"), expiryHours: z.number().int().min(1).max(168).default(24) }).strict(),
  z.object({ ...selected, operation: z.literal("request-exception"), reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ ...request, operation: z.enum(["accept", "decline", "cancel-cover"]), id }).strict(),
  z.object({ ...request, operation: z.enum(["approve-exception", "reject-exception"]), id, reason: z.string().trim().min(1).max(1000) }).strict(),
]);
export type CoverCommand = z.infer<typeof coverCommand>;
export type CoverResult = { ok: boolean; code?: string; message: string; id?: string };
export type ConsentHistory = { id: string; itemId: string; occurrenceId: string; kind: "cover" | "saturday"; candidateId: string; status: string; createdAt: string; expiresAt?: string; respondedAt?: string; reason?: string; decisionReason?: string; closedReason?: string };
export type ConsentCard = ConsentHistory & { candidate: Candidate; labels: Record<string, string>; requestedBy: string; invitedName?: string; canRespond: boolean; canCancel: boolean; canReview: boolean; earlierTiers?: Rejection[]; stale: boolean };
export type CoverWorkspace = { covers: ConsentCard[]; exceptions: ConsentCard[]; notifications: { id: string; message: string; createdAt: string }[]; computedAt: string };
export type ExactSelection = { itemId: string; occurrenceId: string; candidate: Candidate; assignment: Assignment };
