import { z } from "zod";
import { kinds } from "./config";
const text = z.string().trim().min(1, "Required.").max(120, "Use at most 120 characters.");
const id = z.string().min(1, "Choose a record.").max(100);
const code = z.string().trim().toUpperCase().min(1, "Required.").max(30).regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Use letters, numbers, hyphens or underscores.");
const positive = z.coerce.number().int("Use a whole number.").min(1, "Must be positive.").max(1000000);
const weekday = z.coerce.number().int().min(1).max(6);
// Accept explicit numeric/string minutes, but never turn absent/blank input
// or a boolean into midnight through JavaScript number coercion.
const minute = z.union([z.number(), z.string().trim().min(1, "Choose a time.")])
  .transform(value => Number(value)).pipe(z.number().int().min(0).max(1439));
const type = z.enum(["THEORY", "LAB"]);
const interval = { weekday, startMinute: minute, endMinute: minute };
export const dataSchemas = {
  semester: z.object({ code, name: text, startDate: z.iso.date(), endDate: z.iso.date(), active: z.boolean() }).refine(v => v.startDate <= v.endDate, { path: ["endDate"], message: "End date must be on or after start date." }),
  holiday: z.object({ semesterId: id, date: z.iso.date(), name: text }),
  faculty: z.object({ userId: id, designation: text, targetMinutesPerWeek: positive.max(10080), maxMinutesPerDay: positive.max(1440), maxMinutesPerWeek: positive.max(10080) }).refine(v => v.targetMinutesPerWeek <= v.maxMinutesPerWeek && v.maxMinutesPerDay <= v.maxMinutesPerWeek, { path: ["maxMinutesPerWeek"], message: "Weekly maximum must cover the target and daily maximum." }),
  facultyAvailability: z.object({ facultyId: id, ...interval }).refine(v => v.startMinute < v.endMinute, { path: ["endMinute"], message: "End time must be after start time on the same day." }),
  course: z.object({ code, name: text, type, requiredContactMinutes: positive }),
  facultyQualification: z.object({ facultyId: id, courseId: id }),
  section: z.object({ semesterId: id, code, name: text, strength: positive, preferredPeriodsPerDay: positive.max(24) }),
  sectionMembership: z.object({ sectionId: id, userId: id, isRepresentative: z.boolean() }),
  room: z.object({ code, name: text, type, capacity: positive }),
  timeSlot: z.object({ label: text, ...interval }).refine(v => v.startMinute < v.endMinute, { path: ["endMinute"], message: "End time must be after start time on the same day." }),
  courseAllocation: z.object({ semesterId: id, sectionId: id, courseId: id, facultyId: id, weeklyPeriods: positive.max(60), requiredContactMinutes: positive }),
};
export const mutationSchema = z.object({
  kind: z.enum(kinds), operation: z.enum(["save", "archive", "restore"]), id: id.optional(),
  expectedVersion: z.coerce.number().int().positive().optional(), requestId: z.uuid(), data: z.record(z.string(), z.unknown()).default({}),
}).refine(v => v.id ? !!v.expectedVersion : v.operation === "save", { message: "Existing records require an expected version." });
export type MasterResult = { ok: boolean; code?: string; message: string; fieldErrors?: Record<string, string[]>; recordId?: string };
