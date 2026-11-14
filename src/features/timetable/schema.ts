import { z } from "zod";
import { maxDraftEntries, type Conflict, type Placement } from "@/domain/scheduling/timetable";
const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, "Choose a valid date.");
export const placementSchema = z.object({ seriesId: id, allocationId: id, roomId: id, weekday: z.number().int().min(1).max(5), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).strict();
export const scheduleInput = z.object({
  operation: z.enum(["create", "save", "preview", "publish"]), requestId: z.uuid(), semesterId: id,
  draftId: id.optional(), expectedVersion: z.number().int().positive().optional(), expectedRevision: z.number().int().nonnegative(),
  effectiveFrom: date.optional(), entries: z.array(placementSchema).max(maxDraftEntries).optional(), previewFingerprint: z.string().length(64).optional(),
}).strict();
export type ScheduleInput = z.infer<typeof scheduleInput>;
export type Preview = { fingerprint: string; revision: number; count: number; cancelledCount: number; preservedCount: number; recipientCount: number; effectiveFrom: string; effectiveTo: string; changes: { before: string; after: string }[] };
export type ScheduleResult = { ok: boolean; code?: string; message: string; draftId?: string; version?: number; revision?: number; conflicts?: Conflict[]; alternatives?: Placement[]; preview?: Preview };
