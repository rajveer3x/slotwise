import { z } from "zod";

const id = z.string().min(1).max(100);
export const emergencyCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("launch"), occurrenceId: id, requestId: z.uuid() }).strict(),
  z.object({ operation: z.enum(["accept", "cancel"]), roundId: id, requestId: z.uuid() }).strict(),
]);
export type EmergencyCommand = z.infer<typeof emergencyCommand>;
export type EmergencyResult = { ok: true; id: string; message: string } | { ok: false; code: string; message: string };
