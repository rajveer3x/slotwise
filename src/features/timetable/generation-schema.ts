import { z } from "zod";
import type { generateWeekly } from "@/domain/scheduling/generation";

export const generationRequest = z.object({
  semesterId: z.string().min(1).max(100),
  expectedRevision: z.number().int().nonnegative(),
  effectiveFrom: z.iso.date(),
  seed: z.number().int().min(0).max(0xffffffff),
}).strict();
export const importRequest = z.object({ requestId: z.uuid(), token: z.string().min(1).max(160_000) }).strict();

export type GenerationRequest = z.infer<typeof generationRequest>;
export type GenerationSummary = Omit<Awaited<ReturnType<typeof generateWeekly>>, "coverage" | "entries"> & {
  coverage: { allocationId: string; course: string; section: string; required: number; placed: number }[];
  entries: { id: string; weekday: number; startMinute: number; endMinute: number; room: string; allocationId: string }[];
  fixedCount: number;
};
export type GenerationResponse =
  | { ok: true; summary: GenerationSummary; token: string | null }
  | { ok: false; code: string; message: string };
