"use server";
import { revalidatePath } from "next/cache";
import { mutatePublication } from "@/server/services/publications";
export async function publicationAction(input: unknown) {
  const result = await mutatePublication(input);
  if (result.ok && result.publicationId) for (const path of ["/resolutions", "/timetable", "/dashboard", "/leave", "/cover-requests"]) revalidatePath(path);
  return result;
}
