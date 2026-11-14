import { z } from "zod";
import type { ConsentHistory } from "@/features/covers/schema";
import type { ResolutionItem, Decisions } from "@/domain/resolution/engine";
const id = z.string().min(1).max(100);
const candidate = z.string().min(1).max(3000);
export const resolutionDecisions = z.object({
  selected: z.record(id, candidate).refine(x => Object.keys(x).length <= 200),
  rejected: z.record(id, z.array(z.object({ candidateId: candidate, reason: z.string().trim().min(1, "Give a reason before rejecting a candidate.").max(500) }).strict()).max(100)).refine(x => Object.keys(x).length <= 200),
}).strict();
export const resolutionCommand = z.object({
  operation: z.enum(["compute", "save"]), leaveId: id, decisions: resolutionDecisions,
  requestId: z.uuid(), expectedToken: z.string().length(64), expectedVersion: z.number().int().min(0),
}).strict();
export type Board = { items: ResolutionItem[]; history: ConsentHistory[]; savedSelections: Record<string, { itemId: string; candidateId: string | null }>; decisions: Decisions; token: string; revision: number; revisions: { id: string; scheduleRevision: number }[]; policyVersion: string; planVersion: number; stale: boolean; computedAt: string; labels: Record<string, string> };
export type ResolutionResult = { ok: boolean; code?: string; message: string; board?: Board };
