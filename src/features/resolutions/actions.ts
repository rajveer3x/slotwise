"use server";
import { revalidatePath } from "next/cache";
import { mutateResolution } from "@/server/services/resolutions";
export async function resolutionAction(input: unknown) {
  const result = await mutateResolution(input);
  if (result.ok) { revalidatePath("/resolutions"); revalidatePath("/notifications"); revalidatePath("/audit"); }
  return result;
}
