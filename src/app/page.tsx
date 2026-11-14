import { PublicShell } from "@/components/public-shell";
import { ArrowRight, CalendarDays, GitCompareArrows, ListChecks } from "lucide-react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

const benefits = [
  { icon: CalendarDays, title: "One place for the week", description: "Bring faculty, sections and rooms into a readable departmental timetable." },
  { icon: GitCompareArrows, title: "A considered plan for change", description: "Compare explained cover and makeup options when leave affects a class." },
  { icon: ListChecks, title: "Clarity before publication", description: "Review the before and after, then keep affected people informed." },
];

function ScheduleIllustration() {
  return (
    <figure aria-labelledby="schedule-caption" className="overflow-hidden rounded-panel border border-border-subtle bg-canvas">
      <figcaption id="schedule-caption" className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle px-6 py-4">
        <span className="text-sm font-medium">A little structure. A clearer week.</span>
        <span className="text-xs text-text-secondary">Illustration · synthetic example</span>
      </figcaption>
      <div className="grid gap-4 p-4 md:grid-cols-3 md:p-6">
        {[
          { day: "Monday", code: "CS201", course: "Data structures", room: "Room 204", time: "09:00–10:00" },
          { day: "Tuesday", code: "CS203", course: "Database systems", room: "Room 102", time: "10:00–11:00" },
          { day: "Wednesday", code: "CS205", course: "Computer networks", room: "Room 204", time: "09:00–10:00" },
        ].map((item) => (
          <div key={item.day} className="min-w-0">
            <p className="mb-3 text-sm font-medium text-text-secondary">{item.day}</p>
            <div className="rounded-md border-l-2 border-primary bg-primary-tint p-4">
              <p className="mb-3 text-sm font-medium tabular-nums text-info">{item.time}</p>
              <p className="text-sm font-semibold">{item.code} · {item.course}</p>
              <p className="mt-1 text-sm text-text-secondary">{item.room}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="px-4 pb-4 text-xs text-text-secondary md:px-6 md:pb-6">Static illustration in Asia/Kolkata. No live schedule or reservations.</p>
    </figure>
  );
}

export default function HomePage() {
  return (
    <PublicShell><main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <section aria-labelledby="welcome-title" className="mb-8 grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="eyebrow mb-4">LOVELY PROFESSIONAL UNIVERSITY · SLOTWISE</p>
          <h1 id="welcome-title" className="max-w-xl text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] md:text-5xl">A clearer week.<br />Room for change.</h1>
          <p className="mt-6 max-w-xl text-text-secondary">A little structure for everything ahead. Bring your department’s classes, teaching commitments and leave recovery into one thoughtfully organized workspace.</p>
          <Link href="/login" className={buttonClassName("primary", "mt-6")} aria-describedby="login-availability">Sign in <ArrowRight size={16} aria-hidden="true" /></Link>
          <p id="login-availability" className="mt-3 text-sm text-text-secondary">Sign in with an active local demo account.</p>
        </div>
        <aside className="rounded-panel border border-border-subtle bg-surface-subtle p-6" aria-labelledby="preview-title">
          <span className="inline-flex rounded-full bg-warning-tint px-3 py-1 text-xs font-medium text-warning">Local demo</span>
          <h2 id="preview-title" className="mt-4 text-lg font-semibold">Your workspace starts here.</h2>
          <p className="mt-3 text-sm text-text-secondary">Plan your timetable, understand the impact of leave, and compare explained recovery options. Cover responses and recovery publication are the next steps in this academic project.</p>
          <div className="mt-6 border-t border-border-subtle pt-4 text-sm text-text-secondary">A React &amp; Next.js subject project.<br />No real university records are used.</div>
        </aside>
      </section>
      <ScheduleIllustration />
      <section aria-labelledby="direction-title" className="mt-8 mb-4">
        <h2 id="direction-title" className="text-lg font-semibold">What we’re working toward</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title, description }) => (
            <article key={title} className="min-w-0">
              <Icon size={20} className="mb-3 text-text-secondary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-text-secondary">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main></PublicShell>
  );
}
