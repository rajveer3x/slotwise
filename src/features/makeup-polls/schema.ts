import { z } from "zod";

const id = z.string().min(1).max(100);
const request = { requestId: z.uuid() };
export const pollCommand = z.discriminatedUnion("operation", [
  z.object({
    ...request, operation: z.literal("open"), sourceId: id, occurrenceId: id,
    expectedPollId: id.nullable(), expectedToken: z.string().length(64), expectedVersion: z.number().int().nonnegative(),
    candidateIds: z.array(z.string().min(1).max(3000)).min(2).max(3).refine(ids => new Set(ids).size === ids.length),
    deadline: z.iso.datetime(),
  }).strict(),
  z.object({ ...request, operation: z.enum(["close", "cancel"]), pollId: id }).strict(),
  z.object({ ...request, operation: z.literal("vote"), pollId: id, position: z.number().int().min(1).max(3) }).strict(),
]);

export type PollCommand = z.infer<typeof pollCommand>;
export type PollResult =
  | { ok: true; message: string; pollId: string }
  | { ok: false; message: string; code: string };
