"use server";
import { revalidatePath } from "next/cache";
import { sessionIdentity } from "@/server/auth/session";
import { changeNotification } from "@/server/services/notifications";

export async function notificationAction(input: unknown) {
  const result = await changeNotification(await sessionIdentity(), input);
  if (result.ok) revalidatePath("/notifications");
  return result;
}
