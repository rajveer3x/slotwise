"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockTime } from "@/domain/scheduling/timetable";
import type { ResolutionItem } from "@/domain/resolution/engine";
import type { Board } from "@/features/resolutions/schema";
import type { PollView } from "@/server/services/makeup-polls";
import { makeupPollAction } from "./actions";
import type { PollCommand, PollResult } from "./schema";

type WithoutRequest<T> = T extends PollCommand ? Omit<T, "requestId"> : never;

function usePollAction() {
  const [result, setResult] = useState<PollResult>();
  const [pending, startTransition] = useTransition();
  const retry = useRef<{ payload: string; requestId: string } | null>(null);
  const busy = useRef(false);
  function submit(command: WithoutRequest<PollCommand>) {
    if (busy.current) return;
    busy.current = true;
    const payload = JSON.stringify(command);
    const requestId = retry.current?.payload === payload ? retry.current.requestId : crypto.randomUUID();
    retry.current = { payload, requestId };
    startTransition(async () => {
      try {
        const response = await makeupPollAction({ ...command, requestId });
        setResult(response);
        if (response.ok) retry.current = null;
      } catch {
        setResult({ ok: false, code: "NETWORK", message: "Could not reach the server. Your input is retained. Retry the operation." });
      } finally {
        busy.current = false;
      }
    });
  }
  return { result, pending, submit };
}

function Feedback({ result }: { result?: PollResult }) {
  const router = useRouter();
  return <>
    <p role="status" className={result?.ok ? "text-success" : "text-danger"}>{result?.message}</p>
    {result && !result.ok && result.code === "STALE_VERSION" &&
      <Button variant="secondary" onClick={() => router.refresh()}>Refresh poll status</Button>}
  </>;
}

const localDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
});
const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", timeStyle: "short" });
const statuses = { OPEN: "Open", CLOSED: "Closed", CANCELLED: "Cancelled", SUPERSEDED: "Superseded" };

export function PollCard({ poll, manager }: { poll: PollView; manager: boolean }) {
  const [position, setPosition] = useState<number | null>(null);
  const { result, pending, submit } = usePollAction();
  const active = poll.status === "OPEN";
  const canVote = active && !manager;
  const canReview = poll.recoveryUrl && poll.status === "CLOSED" && !poll.resolved;
  const current = position ?? poll.preference;
  function vote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (current !== null) submit({ operation: "vote", pollId: poll.id, position: current });
  }
  return <section className="schedule-panel grid min-w-0 gap-3" aria-labelledby={`poll-${poll.id}`} aria-busy={pending}>
    <h2 id={`poll-${poll.id}`} className="break-words text-lg font-semibold">{poll.course} · {poll.section}</h2>
    <p className={active ? "font-medium text-info" : "font-medium text-text-secondary"}>{statuses[poll.status]} · Deadline {localDateTime.format(new Date(poll.deadline))}</p>
    <p className="text-sm text-text-secondary">Original class {localDateTime.format(new Date(poll.originalStart))}</p>
    {poll.resolved ? <p>This teaching obligation already has a scheduled or delivered class.</p> : poll.scheduleChanged &&
      <p className="text-warning">The schedule has changed since this poll opened. Recompute in Class recovery and check current availability before publishing.</p>}
    <form className="grid gap-3" onSubmit={vote}>
      <fieldset className="grid min-w-0 gap-2" disabled={pending}>
        <legend className="mb-2 font-medium">{canVote ? "Choose your preferred option" : "Offered options"}</legend>
        {poll.options.map(o => {
          const description = <span className="min-w-0 break-words">
            <strong className="block">{localDateTime.format(new Date(o.startAt))}–{localTime.format(new Date(o.endAt))}</strong>
            <span className="block">{o.facultyName} · {o.roomCode}</span>
            {poll.preference === o.position && <span className="block text-sm font-medium text-success">{manager ? "Representative’s preference" : "Your saved preference"}</span>}
          </span>;
          const card = "flex min-h-11 items-center gap-3 rounded-control border p-3";
          return canVote
            ? <label key={o.position} className={`${card} ${current === o.position ? "border-primary bg-primary-tint" : "border-border-control"}`}>
              <input className="accent-primary" type="radio" name={`preference-${poll.id}`} checked={current === o.position} onChange={() => setPosition(o.position)} />{description}
            </label>
            : <div key={o.position} className={`${card} border-border-subtle`}>{description}</div>;
        })}
      </fieldset>
      {canVote && <div><Button type="submit" disabled={pending || current === null}>{pending ? "Saving…" : "Save preference"}</Button></div>}
    </form>
    {manager && poll.preference === null && <p>{active ? "Awaiting a preference." : "No preference recorded. The coordinator can choose a current option."}</p>}
    {manager && active && <div className="flex flex-wrap gap-2">
      <Button disabled={pending} onClick={() => submit({ operation: "close", pollId: poll.id })}>Close poll</Button>
      <Button variant="secondary" disabled={pending} onClick={() => submit({ operation: "cancel", pollId: poll.id })}>Cancel poll</Button>
    </div>}
    {canReview && <Link className="inline-link w-fit" href={poll.recoveryUrl!}>Review in Class recovery</Link>}
    <Feedback result={result} />
  </section>;
}

export function OpenPollForm({ board, item, sourceId, latestPollId, disabled }: {
  board: Board; item: ResolutionItem; sourceId: string; latestPollId: string | null; disabled: boolean;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const { result, pending, submit } = usePollAction();
  const options = item.candidates.filter(c => c.tier === 3);
  const selected = options.filter(c => chosen.includes(c.id));
  const earliest = selected.map(c => c.assignments[0].date).sort()[0];

  if (options.length < 2) return null;
  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const deadline = new Date(`${date}T${time}:00+05:30`);
    if (!Number.isFinite(deadline.getTime())) return;
    submit({
      operation: "open", sourceId, occurrenceId: item.original.occurrenceId, expectedPollId: latestPollId,
      expectedToken: board.token, expectedVersion: board.planVersion,
      candidateIds: selected.map(c => c.id), deadline: deadline.toISOString(),
    });
  }
  return <details className="mt-5 border-t border-border-subtle pt-3">
    <summary className="cursor-pointer py-2 font-semibold">Offer a representative poll</summary>
    <p className="my-2 text-sm text-text-secondary">Choose two or three weekday options and set a deadline before their start times.</p>
    {latestPollId && <p className="my-2 text-sm"><Link className="inline-link" href={`/makeup-polls?poll=${encodeURIComponent(latestPollId)}`}>View latest poll</Link>. Opening a replacement keeps the earlier options and preference in history.</p>}
    {disabled && <p className="my-2 text-warning">Recompute stale choices and save draft edits before opening a poll.</p>}
    <form className="grid gap-3" onSubmit={open} aria-busy={pending}>
      <fieldset className="grid min-w-0 gap-2" disabled={pending || disabled}>
        <legend className="mb-2 font-medium">Options to offer</legend>
        {options.map(c => {
          const a = c.assignments[0];
          return <label key={c.id} className="flex min-h-11 items-center gap-3 rounded-control border border-border-control p-3">
            <input className="accent-primary" type="checkbox" checked={chosen.includes(c.id)} onChange={e => setChosen(ids => e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />
            <span className="min-w-0 break-words">{a.date} · {clockTime(a.startMinute)}–{clockTime(a.endMinute)} · {board.labels[a.roomId!]}</span>
          </label>;
        })}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0">Deadline date<Input type="date" required value={date} max={earliest} onChange={e => setDate(e.target.value)} /></label>
          <label className="min-w-0">Deadline time (Asia/Kolkata)<Input type="time" required value={time} onChange={e => setTime(e.target.value)} /></label>
        </div>
        <div><Button type="submit" disabled={selected.length < 2 || !date || !time}>{pending ? "Opening…" : latestPollId ? "Open replacement poll" : "Open poll"}</Button></div>
      </fieldset>
      <Feedback result={result} />
      {result?.ok && <Link className="inline-link w-fit" href={`/makeup-polls?poll=${encodeURIComponent(result.pollId)}`}>View opened poll</Link>}
    </form>
  </details>;
}
