import { z } from "zod";

const date = z.iso.date().refine(value => value >= "0001-01-01" && value <= "9999-12-26");
const department = z.string().min(1).max(100).optional();

export const workloadFilter = z.object({ department, week: date.optional() }).strict();
export const recoveryFilter = z.object({ department, from: date.optional(), to: date.optional() }).strict();
export type InsightQuery = Record<string, string | string[] | undefined>;
