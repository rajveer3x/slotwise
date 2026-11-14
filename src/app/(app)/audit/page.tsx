import { AuditWorkspace } from "@/features/audit/components";
import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { auditActions, readAudit } from "@/server/services/audit";

export default async function AuditPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageSession();
  let result;
  try {
    result = await readAudit(actor.id, await searchParams);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    return <main id="main-content" tabIndex={-1} className="app-content">
      <h1>Access denied</h1>
      <p>You can only view audit events within your authorized department.</p>
    </main>;
  }

  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata</p>
    <h1>Audit history</h1>
    <p className="page-description">Review recorded departmental changes and the staff accounts that made them.</p>
    <AuditWorkspace result={result} actions={auditActions} />
  </main>;
}
