import type { ReactNode } from "react";
import { requirePageSession } from "@/server/auth/page-session";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageSession();
  return <AppShell name={user.name} role={user.role} department={user.department.name}>{children}</AppShell>;
}
