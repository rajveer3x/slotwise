import { authConfig } from "@/server/auth/config";
import { sessionIdentity } from "@/server/auth/session";
import { runGeneration } from "@/server/services/timetable-generation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== authConfig().origin) {
    return Response.json({ ok: false, code: "FORBIDDEN", message: "Open the timetable to start generation." }, { status: 403 });
  }
  const actorId = await sessionIdentity();
  const reader = request.body?.getReader();
  let input: unknown;
  if (reader) {
    const decoder = new TextDecoder();
    let json = "", bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2048) {
          await reader.cancel();
          break;
        }
        json += decoder.decode(value, { stream: true });
      }
      if (bytes <= 2048) input = JSON.parse(json + decoder.decode());
    } catch {
      // The service returns validated feedback for malformed or absent input.
    } finally {
      reader.releaseLock();
    }
  }
  const result = await runGeneration(actorId, input, request.signal);
  const status = result.ok ? 200 : result.code === "UNAUTHORIZED" ? 401 : result.code === "FORBIDDEN" ? 403 : 400;
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
