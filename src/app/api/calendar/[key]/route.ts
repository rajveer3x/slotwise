import { readCalendarFeed } from "@/server/services/calendar-feeds";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const calendar = await readCalendarFeed((await params).key);
    if (calendar === null) return new Response("Calendar unavailable.", { status: 404, headers });
    return new Response(calendar, { headers: { ...headers, "Content-Type": "text/calendar; charset=utf-8" } });
  } catch {
    return new Response("Calendar temporarily unavailable.", { status: 503, headers });
  }
}
