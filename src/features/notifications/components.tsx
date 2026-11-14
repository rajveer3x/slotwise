"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { readNotificationInbox } from "@/server/services/notifications";
import { notificationAction } from "./actions";

type Inbox = Awaited<ReturnType<typeof readNotificationInbox>>;
type Notice = Inbox["notices"][number];
const timestamp = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export function NotificationTime({ value }: { value: string }) {
  return <time dateTime={value}>{timestamp.format(new Date(value))}</time>;
}

export function RefreshNotifications() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="secondary" aria-disabled={pending} onClick={() => {
    if (!pending) startTransition(() => router.refresh());
  }}>{pending ? "Refreshing…" : "Refresh"}</Button>;
}

export function NotificationList({ notices, unread }: Pick<Inbox, "notices" | "unread">) {
  const [reading, markReading] = useOptimistic(new Set<string>(), (ids, id: string) => new Set([...ids, id]));
  const unreadCount = unread - notices.filter(n => !n.read && reading.has(n.id)).length;
  return <>
    <p className="mb-4 text-sm text-text-secondary" aria-live="polite">{unreadCount} unread</p>
    {notices.length > 0 ? <ul className="grid gap-4">{notices.map(notice =>
      <li key={notice.id}>
        <NotificationCard notice={notice} read={notice.read || reading.has(notice.id)} markReading={markReading} />
      </li>
    )}</ul> : <p>You have no in-app notifications yet.</p>}
  </>;
}

function NotificationCard({ notice, read, markReading }: {
  notice: Notice;
  read: boolean;
  markReading: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string }>();
  function update(operation: "read" | "acknowledge") {
    if (pending) return;
    setFeedback(undefined);
    startTransition(async () => {
      if (operation === "read") markReading(notice.id);
      try {
        setFeedback(await notificationAction({ notificationId: notice.id, operation }));
      } catch {
        setFeedback({ ok: false, message: "Could not reach the server. Try again." });
      }
    });
  }

  return <article className="grid gap-3 rounded-control border border-border-subtle p-4 wrap-anywhere">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
      <span className={read ? "rounded-full bg-surface-subtle px-2 py-1" : "rounded-full bg-primary-tint px-2 py-1 font-semibold text-primary"}>{read ? "Read" : "Unread"}</span>
      <Link className="inline-link" href={`/notifications?notice=${encodeURIComponent(notice.id)}`} prefetch={false} aria-label="Open this notification">
        <NotificationTime value={notice.createdAt} />
      </Link>
    </div>
    <p className="font-semibold">{notice.message}</p>
    {notice.changes.map(change => <div key={change.id} className="rounded-control bg-surface-subtle p-3 text-sm">
      <h3 className="font-semibold">{change.title}</h3>
      <dl className="mt-2 grid gap-3 md:grid-cols-2">
        <div><dt className="font-medium">Before publication</dt><dd>{change.before}</dd></div>
        <div><dt className="font-medium">{change.status}</dt><dd>{change.after}</dd></div>
      </dl>
      <Link className="inline-link mt-2 inline-flex min-h-11 items-center" href={change.timetableHref} prefetch={false}>Open current timetable</Link>
    </div>)}
    {notice.changes.length === 0 && <Link className="inline-link inline-flex min-h-11 items-center justify-self-start" href={notice.href} prefetch={false}>
      {notice.href === "/timetable" ? "Open current timetable" : "Open cover & exceptions"}
    </Link>}
    <div className="flex flex-wrap items-center gap-3">
      {(!notice.read || pending) && <Button variant="secondary" aria-disabled={pending} onClick={() => update("read")}>Mark as read</Button>}
      {notice.canAcknowledge && (notice.acknowledgedAt
        ? <span className="text-sm font-medium text-success">Acknowledged · <NotificationTime value={notice.acknowledgedAt} /></span>
        : <Button aria-disabled={pending} onClick={() => update("acknowledge")}>Acknowledge change</Button>)}
    </div>
    <p role="status" className={feedback && !feedback.ok ? "text-sm text-danger" : "text-sm text-success"}>
      {pending ? "Saving update…" : feedback?.message}
    </p>
  </article>;
}
