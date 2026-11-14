"use server";
import { revalidatePath } from "next/cache";
import { mutateLeave, previewLeave } from "@/server/services/leave";
import type { LeaveResult } from "./schema";
export async function leaveImpactAction(input: unknown): Promise<LeaveResult> { return previewLeave(input); }
export async function leaveAction(input: unknown): Promise<LeaveResult> {
  const result = await mutateLeave(input);
  if (result.ok) { revalidatePath("/leave"); revalidatePath("/timetable"); revalidatePath("/dashboard"); revalidatePath("/delivery"); revalidatePath("/classes-owed"); }
  return result;
}
