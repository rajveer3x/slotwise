"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { setAccountActive } from "@/server/services/accounts";
import { AccessError } from "@/server/auth/session";
export async function updateAccountAccess(_previous: { ok: boolean; message: string }, data: FormData) {
  try {
    const bool = z.enum(["true", "false"]).transform(value => value === "true");
    const input = z.object({ userId: z.string().min(1).max(100), active: bool, expectedActive: bool }).safeParse(Object.fromEntries(data));
    if (!input.success) return { ok: false, message: "Invalid account change. Refresh and try again." };
    const result = await setAccountActive(input.data);
    revalidatePath("/admin");
    return { ok: result.ok, message: result.message };
  } catch (error) {
    if (error instanceof AccessError) return { ok: false, message: error.code === "UNAUTHORIZED" ? "Your session is no longer active. Sign in again." : "You do not have permission to change this account." };
    return { ok: false, message: "Could not update account access. Refresh and try again." };
  }
}
