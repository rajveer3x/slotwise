"use server";
import { revalidatePath } from "next/cache";
import { mutateMakeupPoll } from "@/server/services/makeup-polls";

export async function makeupPollAction(input: unknown) {
  const result = await mutateMakeupPoll(input);
  if (result.ok) {
    revalidatePath("/makeup-polls");
    revalidatePath("/resolutions");
    revalidatePath("/audit");
  }
  return result;
}
