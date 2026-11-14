import { z } from "zod";
import { csvKinds } from "@/features/csv/config";
import { AccessError, requireSession } from "@/server/auth/session";
import { requireScope } from "@/server/auth/permissions";
import { downloadTemplate, exportTimetableCsv } from "@/server/services/csv-export";

export async function GET(request: Request) {
  try {
    const actor = await requireSession();
    requireScope(actor, ["ADMIN", "COORDINATOR"], actor.departmentId);
    const params = new URL(request.url).searchParams;
    const template = params.get("template");
    const kind = z.enum(csvKinds).safeParse(template);
    if (template !== null && !kind.success) return new Response("Unknown CSV template.", { status: 400 });

    const csv = kind.success ? downloadTemplate(kind.data) : await exportTimetableCsv(actor.id, params.get("semester") ?? "");
    const filename = kind.success ? `slotwise-${kind.data}-template.csv` : "slotwise-published-timetable.csv";
    return new Response(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AccessError) {
      return new Response("CSV download unavailable for this account or semester.", {
        status: error.code === "UNAUTHORIZED" ? 401 : 403,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    throw error;
  }
}
