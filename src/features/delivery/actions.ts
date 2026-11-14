"use server";
import { revalidatePath } from "next/cache";
import { mutateDelivery } from "@/server/services/delivery";
export async function deliveryAction(input: unknown) {
  const result = await mutateDelivery(input);
  if (result.ok) for (const path of ["/delivery", "/classes-owed", "/timetable", "/dashboard", "/resolutions", "/leave", "/cover-requests", "/workload", "/reports", "/notifications"]) revalidatePath(path);
  return result;
}
