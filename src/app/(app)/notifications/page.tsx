import Link from "next/link";
import { NotificationList, NotificationTime, RefreshNotifications } from "@/features/notifications/components";
import { requirePageSession } from "@/server/auth/page-session";
import { AccessError } from "@/server/auth/session";
import { readAcknowledgementCounts, readNotification, readNotificationInbox } from "@/server/services/notifications";

export default async function NotificationsPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[]; notice?: string | string[] }>;
}) {
  const actor = await requirePageSession();
  const query = await searchParams;
  const requested = Number(query.page);
  const selected = typeof query.notice === "string" ? query.notice : undefined;
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const [inbox, counts] = await Promise.all([
    readNotificationInbox(actor.id, page),
    actor.role === "ADMIN" || actor.role === "COORDINATOR" ? readAcknowledgementCounts(actor.id) : null,
  ]);

  let notice;
  if (selected) {
    try {
      notice = await readNotification(actor.id, selected);
    } catch (error) {
      if (!(error instanceof AccessError) || error.code !== "FORBIDDEN") throw error;
    }
  }

  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="eyebrow mb-2">{actor.department.name} · Asia/Kolkata</p>
    <h1>Notifications</h1>
    <p className="page-description">Review schedule updates. Acknowledgement records that you saw a published change.</p>
    <section className="schedule-panel mt-6" aria-labelledby="inbox-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="inbox-title" className="text-lg font-semibold">Your updates</h2>
        <RefreshNotifications />
      </div>
      {selected && <Link href="/notifications" className="inline-link mb-3 inline-flex min-h-11 items-center">Back to all updates</Link>}
      {selected && !notice
        ? <p>This notification is unavailable for your account.</p>
        : <NotificationList notices={notice ? [notice] : inbox.notices} unread={inbox.unread} />}
      {!selected && inbox.pages > 1 && <nav className="mt-4 flex flex-wrap items-center gap-3" aria-label="Notification pages">
        {inbox.page > 1 && <Link className="button button-secondary" href={`/notifications?page=${inbox.page - 1}`}>Newer</Link>}
        <p>Page {inbox.page} of {inbox.pages}</p>
        {inbox.page < inbox.pages && <Link className="button button-secondary" href={`/notifications?page=${inbox.page + 1}`}>Older</Link>}
      </nav>}
    </section>
    {counts && <section className="schedule-panel mt-6" aria-labelledby="ack-counts">
      <h2 id="ack-counts" className="text-lg font-semibold">Department acknowledgements</h2>
      <p className="mt-2 text-sm text-text-secondary">Counts use the recipients recorded when each recovery was published.</p>
      {counts.length === 0 ? <p className="mt-4">No recovery changes have been published yet.</p> : <ul className="mt-4 grid gap-3">
        {counts.map(change => <li key={change.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border-subtle pt-3">
          <div>
            <p>Published <NotificationTime value={change.createdAt} /> · {change.classes} {change.classes === 1 ? "class" : "classes"}</p>
            {change.ownNotificationId && <Link className="inline-link inline-flex min-h-11 items-center" prefetch={false}
              href={`/notifications?notice=${encodeURIComponent(change.ownNotificationId)}`}>Review published change</Link>}
          </div>
          <p className="font-semibold tabular-nums">{change.acknowledged} of {change.recipients} acknowledged</p>
        </li>)}
      </ul>}
    </section>}
  </main>;
}
