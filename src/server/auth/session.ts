import "server-only";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDb } from "@/server/db";
import { authConfig } from "./config";

export class AccessError extends Error {
  constructor(public code: "UNAUTHORIZED" | "FORBIDDEN") { super(code); }
}
export async function sessionIdentity() {
  const config = authConfig();
  const token = await getToken({ req: new NextRequest(config.origin, { headers: await headers() }), secret: config.secret, secureCookie: config.secure });
  return token?.sub || null;
}
export const actorSelect = { id: true, name: true, email: true, role: true, active: true, departmentId: true, department: { select: { name: true, timezone: true } } } as const;
export async function requireSession() {
  const id = await sessionIdentity();
  const user = id ? await getDb().user.findUnique({ where: { id }, select: actorSelect }) : null;
  if (!user?.active) throw new AccessError("UNAUTHORIZED");
  return user;
}
