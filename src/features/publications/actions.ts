"use server";
import { revalidatePath } from "next/cache";
import { mutatePublication } from "@/server/services/publications";
export async function publicationAction(input: unknown) {
  const result = await mutatePublication(input);
  if (result.ok && result.publicationId) for (const path of ["/resolutions", "/makeup-polls", "/timetable", "/dashboard", "/leave", "/cover-requests", "/delivery", "/classes-owed", "/workload", "/reports", "/notifications", "/audit"]) revalidatePath(path);
  return result;
}
