"use server";
import { revalidatePath } from "next/cache";
import { mutateCover } from "@/server/services/covers";
export async function coverAction(input: unknown) {
  const result = await mutateCover(input);
  if (result.ok || result.code === "EXPIRED") {
    revalidatePath("/cover-requests");
    revalidatePath("/resolutions");
  }
  return result;
}
