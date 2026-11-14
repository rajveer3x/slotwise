import { z } from "zod";
const id = z.string().min(1).max(100);
export const deliveryCommand = z.object({
  operation: z.enum(["confirm", "correct"]), occurrenceId: id,
  status: z.enum(["HELD", "NOT_HELD"]), expectedRecordId: id.nullable(),
  reason: z.string().trim().max(1000).optional(), requestId: z.uuid(),
}).strict().superRefine((v, ctx) => {
  if (v.operation === "correct" && (!v.reason || !v.expectedRecordId)) ctx.addIssue({ code: "custom", message: "A correction needs the current record and a reason." });
  if (v.operation === "confirm" && v.expectedRecordId !== null) ctx.addIssue({ code: "custom", message: "Use a correction for an existing record." });
});
export type DeliveryResult = { ok: true; message: string; recordId: string } | { ok: false; code: string; message: string };
