import "server-only";
import { credentialsSchema } from "@/features/auth/schema";
import { getDb } from "@/server/db";
import { loginLimiter } from "./limiter";
import { verifyPassword } from "./password";

export async function authenticateCredentials(input: unknown) {
  const parsed = credentialsSchema.safeParse(input);
  const rawEmail = typeof (input as { email?: unknown })?.email === "string" ? (input as { email: string }).email.trim().toLowerCase().slice(0, 254) : "";
  if (!loginLimiter.admit(rawEmail) || !parsed.success) return null;
  const user = await getDb().user.findUnique({ where: { email: parsed.data.email } });
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!valid || !user?.active) return null;
  // JWT holds identity only; authorization always reloads trusted storage.
  return { id: user.id };
}
