import "server-only";
import { redirect } from "next/navigation";
import { requireSession, AccessError } from "./session";
export async function requirePageSession() {
  try { return await requireSession(); }
  catch (error) { if (error instanceof AccessError && error.code === "UNAUTHORIZED") redirect("/login"); throw error; }
}
