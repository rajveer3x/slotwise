"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { tierNames } from "@/domain/resolution/engine";
import { clockTime } from "@/domain/scheduling/timetable";
import type { readEmergencyCards } from "@/server/services/emergency-cover";
import { NotificationTime } from "@/features/notifications/components";
import { emergencyCoverAction } from "./actions";
import type { EmergencyCommand, EmergencyResult } from "./schema";

function useEmergencyAction() {
  const router = useRouter();
  const [result, setResult] = useState<EmergencyResult>();
  const [pending, transition] = useTransition();
  const retry = useRef<{ payload: string; id: string } | null>(null);
  const busy = useRef(false);
  function run(command: Omit<Extract<EmergencyCommand, { operation: "launch" }>, "requestId">
    | Omit<Extract<EmergencyCommand, { roundId: string }>, "requestId">) {
    if (busy.current) return;
    busy.current = true;
    const payload = JSON.stringify(command);
    if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
    transition(async () => {
      try {
        const response = await emergencyCoverAction({ ...command, requestId: retry.current!.id });
        if (response.ok || response.code !== "ERROR") retry.current = null;
        setResult(response);
        router.refresh();
      } catch {
        setResult({ ok: false, code: "ERROR", message: "Could not reach the server. Try again or refresh." });
      } finally {
        busy.current = false;
      }
    });
  }
  return { result, pending, run };
}

function Feedback({ pending, result }: { pending: boolean; result?: EmergencyResult }) {
  return <p role="status" className={result && !result.ok ? "text-sm text-danger" : "text-sm text-success"}>{pending ? "Saving emergency cover update…" : result?.message}</p>;
}

export function LaunchEmergencyRound({ occurrenceId }: { occurrenceId: string }) {
  const { run, result, pending } = useEmergencyAction();
  return <div className="my-4 grid gap-2 rounded-control border border-border-subtle p-4">
    <h4 className="font-semibold">Emergency cover</h4>
    <p className="text-sm">Offer the original class to eligible substitutes for up to five minutes, ending at class start. Offers appear in-app when faculty open or refresh Cover & exceptions. A coordinator reviews and publishes the winner.</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" disabled={pending || result?.ok} onClick={() => run({ operation: "launch", occurrenceId })}>Launch emergency round</Button>
      <Link className="inline-link" href="/cover-requests#emergency-cover" prefetch={false}>Review rounds and offers</Link>
    </div>
    <Feedback pending={pending} result={result} />
  </div>;
}

type Card = Awaited<ReturnType<typeof readEmergencyCards>>[number];

function roundLabel(card: Card) {
  if (card.published) return card.manage || card.wonByMe ? "Published" : "Already filled";
  if (card.awaitingExpiry) return "Response window ended";
  if (card.status === "WON") return card.manage || card.wonByMe ? "Filled · Pending publication" : "Already filled";
  if (card.status === "EXPIRED") return "Expired";
  if (card.status === "CANCELLED") return "Cancelled";
  return card.manage ? "Waiting for acceptance" : "Emergency offer";
}

function EmergencyCard({ card }: { card: Card }) {
  const { run, result, pending } = useEmergencyAction();
  return <li className="grid gap-3 rounded-control border border-border-subtle p-4 wrap-anywhere" aria-busy={pending}>
    <h3 className="font-semibold">{card.course.code} · {card.course.name}</h3>
    <p className={card.status === "WON" ? "text-sm text-success" : card.awaitingExpiry || card.status === "EXPIRED" ? "text-sm text-warning" : "text-sm text-text-secondary"}>{roundLabel(card)}</p>
    <p className="text-sm">{card.section}{card.room && ` · ${card.room}`} · <NotificationTime value={card.startAt} /> to <NotificationTime value={card.endAt} /></p>
    <p className="text-sm">Response deadline <NotificationTime value={card.deadline} /> · Asia/Kolkata</p>
    {card.offers !== null && <p className="text-sm">{card.offers} faculty invited{card.winner && ` · Accepted by ${card.winner}`}</p>}
    {card.awaitingExpiry && card.manage && <p className="text-sm">The expiry worker will record the fallback. Refresh to see it.</p>}
    {card.fallback && (card.fallback.tier ? <div className="rounded-control bg-surface-subtle p-3 text-sm">
      <p className="font-semibold">Proposed next tier · {tierNames[card.fallback.tier]}</p>
      <ul className="mt-2 grid gap-1">{card.fallback.assignments.map((a, index) =>
        <li key={index}>{a.date} · {clockTime(a.startMinute)}–{clockTime(a.endMinute)}</li>)}</ul>
      <p className="mt-2">Recheck this proposal in Class recovery before saving and publishing it.</p>
    </div> : <p className="text-sm">{card.fallback.sourceResolved ? "This class is no longer eligible for recovery." :
      card.fallback.searchComplete ? "No valid later-tier option was found in the recovery window." : "The later-tier search reached its limit. Review current options in Class recovery."}</p>)}
    <div className="flex flex-wrap items-center gap-3">
      {card.canAccept && <Button disabled={pending} onClick={() => run({ operation: "accept", roundId: card.id })}>Accept emergency offer</Button>}
      {card.canCancel && <Button variant="secondary" disabled={pending} onClick={() => run({ operation: "cancel", roundId: card.id })}>Cancel emergency round</Button>}
      {card.reviewHref && <Link className="inline-link" href={card.reviewHref} prefetch={false}>Review in Class recovery</Link>}
    </div>
    <Feedback pending={pending} result={result} />
  </li>;
}

export function EmergencyCoverPanel({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  return <section id="emergency-cover" className="schedule-panel mt-6 grid gap-4" aria-labelledby="emergency-cover-heading">
    <div>
      <h2 id="emergency-cover-heading" className="text-lg font-semibold">Emergency cover</h2>
      <p className="mt-2 text-sm">Same-day offers and responses appear in-app when you open or refresh this page. Accepted offers await coordinator publication.</p>
    </div>
    <div><Button variant="secondary" disabled={pending} onClick={() => transition(() => router.refresh())}>{pending ? "Refreshing…" : "Refresh emergency cover"}</Button></div>
    {cards.length ? <ul className="grid gap-4">{cards.map(card => <EmergencyCard key={card.id} card={card} />)}</ul> : <p className="text-sm">No emergency rounds or offers in your workspace.</p>}
  </section>;
}
