"use server";
import { revalidatePath } from "next/cache";
import { mutateTimetable } from "@/server/services/timetable";
import type { ScheduleResult } from "./schema";
export async function timetableAction(input: unknown): Promise<ScheduleResult> {
  const result = await mutateTimetable(input);
  if (result.ok && !result.preview) { revalidatePath("/timetable"); revalidatePath("/leave"); revalidatePath("/dashboard"); }
  return result;
}
