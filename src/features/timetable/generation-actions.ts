"use server";

import { revalidatePath } from "next/cache";
import { sessionIdentity } from "@/server/auth/session";
import { importGeneration } from "@/server/services/timetable-generation";

export async function openGeneratedDraft(input: unknown) {
  const result = await importGeneration(await sessionIdentity(), input);
  if (result.ok) {
    revalidatePath("/timetable");
    revalidatePath("/audit");
  }
  return result;
}
