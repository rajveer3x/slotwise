import { z } from "zod";

export const calendarChange = z.object({
  operation: z.enum(["create", "rotate", "revoke"]),
  scope: z.enum(["FACULTY", "SECTION"]),
  scopeId: z.string().min(1).max(100),
  expectedVersion: z.number().int().nonnegative(),
});

export type CalendarChange = z.infer<typeof calendarChange>;
export type CalendarFeedCard = Pick<CalendarChange, "scope" | "scopeId"> & {
  label: string;
  allowed: boolean;
  active: boolean;
  version: number;
};

export type CalendarResult =
  | { ok: true; message: string; version: number; url?: string }
  | { ok: false; message: string; code: "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR" | "STALE_VERSION" | "UNAVAILABLE" };
