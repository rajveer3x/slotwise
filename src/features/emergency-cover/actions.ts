"use server";

import { revalidatePath } from "next/cache";
import { sessionIdentity } from "@/server/auth/session";
import { changeEmergencyCover } from "@/server/services/emergency-cover";

export async function emergencyCoverAction(input: unknown) {
  const result = await changeEmergencyCover(await sessionIdentity(), input);
  if (result.ok) {
    revalidatePath("/cover-requests");
    revalidatePath("/resolutions");
    revalidatePath("/notifications");
    revalidatePath("/audit");
  }
  return result;
}
