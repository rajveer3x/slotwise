"use server";

import { revalidatePath } from "next/cache";
import { sessionIdentity } from "@/server/auth/session";
import { changeCalendarSubscription } from "@/server/services/calendar-feeds";

export async function calendarSubscriptionAction(input: unknown) {
  const result = await changeCalendarSubscription(await sessionIdentity(), input);
  if (result.ok) revalidatePath("/calendar-feeds");
  return result;
}
