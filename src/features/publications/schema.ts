import { z } from "zod";
import type { Assignment } from "@/domain/resolution/engine";
const id = z.string().min(1).max(100);
export const publicationCommand = z.object({
  operation: z.enum(["preview", "publish"]), leaveId: id,
  occurrenceIds: z.array(id).min(1).max(200).refine(ids => new Set(ids).size === ids.length),
  meetingUrls: z.record(id, z.string().trim().max(2048)).refine(x => Object.keys(x).length <= 200),
  expectedToken: z.string().length(64), expectedVersion: z.number().int().positive(),
  previewFingerprint: z.string().length(64).optional(), requestId: z.uuid(),
}).strict();
export type PublicationPreview = {
  fingerprint: string; token: string; planVersion: number; revision: number;
  changes: { itemId: string; tier: number; beforeStatus: "ACTIVE" | "CANCELLED"; before: Assignment; after: Assignment; meetingUrl: string | null }[];
  selectedCount: number; unresolved: Assignment[];
  recipients: { id: string; name: string; role: string }[];
  blockers: string[]; labels: Record<string, string>;
};
export type PublicationResult = { ok: true; message: string; preview?: PublicationPreview; publicationId?: string; revision?: number } | { ok: false; code: string; message: string };
