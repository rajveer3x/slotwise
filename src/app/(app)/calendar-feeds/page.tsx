import { CalendarSubscriptionCard } from "@/features/calendar-feeds/components";
import { requirePageSession } from "@/server/auth/page-session";
import { readCalendarSubscriptions } from "@/server/services/calendar-feeds";

export default async function CalendarFeedsPage() {
  const actor = await requirePageSession();
  const cards = await readCalendarSubscriptions(actor.id);
  return <main id="main-content" tabIndex={-1} className="app-content">
    <p className="mb-2 text-sm text-text-secondary">{actor.department.name} · {actor.department.timezone}</p>
    <h1 className="text-2xl font-semibold md:text-[28px]">Calendar feeds</h1>
    <p className="mt-3">Subscribe to your published schedule in your calendar app. Your app decides when it refreshes.</p>
    {cards.length > 0 && <p className="mt-2 text-text-secondary">Anyone with the URL can read the feed while the link and your access are active. Copy it when it appears after creation or rotation.</p>}
    <div className="mt-6 grid gap-4">
      {cards.length ? cards.map(card => <CalendarSubscriptionCard key={`${card.scope}/${card.scopeId}`} card={card} />)
        : <p className="schedule-panel">Your account has no teaching profile or student section eligible for a feed.</p>}
    </div>
  </main>;
}
