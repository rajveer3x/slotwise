import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { AccessError } from "./session";

export function requireScope(actor: { active: boolean; role: Role; departmentId: string } | null, roles: readonly Role[], departmentId: string) {
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  if (!roles.includes(actor.role) || actor.departmentId !== departmentId) throw new AccessError("FORBIDDEN");
}
