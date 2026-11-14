import { z } from "zod";
import type { ResolutionPolicy } from "@/domain/resolution/engine";

const id = z.string().min(1).max(100);
const date = z.iso.date().refine(value => value >= "0001-01-01" && value <= "9999-12-01");
export const simulationRequest = z.object({
  departmentId: id,
  kind: z.enum(["room", "faculty"]),
  resourceId: id,
  startDate: date,
  endDate: date,
}).strict().refine(input => input.startDate <= input.endDate && Date.parse(input.endDate) - Date.parse(input.startDate) <= 30 * 86_400_000, {
  path: ["endDate"],
  message: "Choose an inclusive range of up to 31 days, with the end on or after the start.",
});

export const baselineCheck = z.object({ departmentId: id, token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type Scenario = z.infer<typeof simulationRequest>;
export type SimulationFailure = { ok: false; code: string; message: string };
export type ClassSummary = { course: string; section: string; faculty: string; room: string; date: string; start: number; end: number };
export type SimulationResult = {
  scenario: Scenario;
  resource: string;
  baseline: {
    token: string;
    computedAt: string;
    revisions: { name: string; revision: number }[];
    policy: ResolutionPolicy & { onlineEnabled: boolean };
  };
  items: {
    id: string;
    original: ClassSummary;
    candidates: { tier: string; assignments: ClassSummary[]; why: string; requires: string | null }[];
    blockers: string[];
    searchComplete: boolean;
  }[];
  workload: { key: string; week: string; faculty: string; target: number | null; baseline: number; projected: number }[];
};
