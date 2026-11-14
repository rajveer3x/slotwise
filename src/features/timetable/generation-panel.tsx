"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockTime, days } from "@/domain/scheduling/timetable";
import type { TimetableSnapshot } from "@/server/services/timetable";
import type { GenerationResponse, GenerationSummary } from "./generation-schema";
import { openGeneratedDraft } from "./generation-actions";

const searchLabels = {
  finished: "Search finished",
  timeout: "Time limit reached",
  cancelled: "Search cancelled",
  "work-limit": "Search work limit reached",
};
type Proposal = { summary: GenerationSummary; token: string | null; requestId: string; revision: number };

export function GenerationPanel({ semester, today, hasAllocations }: {
  semester: NonNullable<TimetableSnapshot["semester"]>;
  today: string;
  hasAllocations: boolean;
}) {
  const router = useRouter();
  const firstDate = semester.startDate > today ? semester.startDate : today;
  const [date, setDate] = useState(firstDate), [seed, setSeed] = useState("1");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; code?: string } | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const active = useRef<AbortController | null>(null), saving = useRef(false);
  useEffect(() => () => active.current?.abort(), []);

  const stale = feedback?.code === "STALE_VERSION" || (!!proposal && proposal.revision !== semester.scheduleRevision);
  const canGenerate = firstDate <= semester.endDate && hasAllocations;
  async function generate() {
    if (active.current || saving.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy("generate");
    setFeedback(null);
    setProposal(null);
    try {
      const response = await fetch("/api/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId: semester.id, expectedRevision: semester.scheduleRevision, effectiveFrom: date, seed: Number(seed) }),
        signal: controller.signal,
      });
      const result: GenerationResponse = await response.json();
      if (controller.signal.aborted) return;
      if (!result.ok) { setFeedback(result); return; }
      setProposal({ ...result, requestId: crypto.randomUUID(), revision: semester.scheduleRevision });
    } catch {
      if (!controller.signal.aborted) setFeedback({ message: "The search could not be completed. Try again with your input retained." });
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  }

  function cancel() {
    active.current?.abort();
    active.current = null;
    setBusy(null);
    setFeedback({ message: "Search cancelled. Generate again to review a new proposal." });
  }

  async function save() {
    if (!proposal?.token || stale || saving.current || active.current) return;
    saving.current = true;
    setBusy("save");
    setFeedback(null);
    try {
      const result = await openGeneratedDraft({ token: proposal.token, requestId: proposal.requestId });
      if (result.ok) {
        router.push(`/timetable?${new URLSearchParams({ semester: semester.id, draft: result.draftId! })}`);
        setProposal(null);
        setFeedback({ message: "Generated draft saved." });
      } else setFeedback(result);
    } catch {
      setFeedback({ message: "The save could not be confirmed. Open as draft again to retry the same save." });
    } finally {
      saving.current = false;
      setBusy(null);
    }
  }

  function clearProposal() {
    setFeedback(null);
    setProposal(null);
  }

  return <section className="schedule-panel" aria-labelledby="generation-heading">
    <h2 id="generation-heading" className="text-lg font-semibold">Generate a weekly timetable</h2>
    <p className="my-3 text-text-secondary">Review a proposed Monday–Friday template, then open it in the draft editor. Existing published weekly placements are held fixed. The publication preview checks dated classes, leave and holidays.</p>
    {!canGenerate ? <p>{firstDate > semester.endDate ? "This semester has ended. Select a current or future semester." : "No active allocations are configured for this semester. Add allocations in Master data."}</p> : <>
      <form onSubmit={event => { event.preventDefault(); void generate(); }}>
        <fieldset className="flex flex-wrap items-end gap-4" disabled={!!busy || stale}>
          <label className="grid gap-2">Effective from
            <Input type="date" required min={firstDate} max={semester.endDate} value={date} onChange={event => { setDate(event.target.value); clearProposal(); }} />
          </label>
          <label className="grid gap-2">Search seed
            <Input type="number" className="w-40 max-w-full" min={0} max={0xffffffff} step={1} required value={seed} onChange={event => { setSeed(event.target.value); clearProposal(); }} />
          </label>
          <Button type="submit">Generate proposal</Button>
        </fieldset>
      </form>
      {busy === "generate" && <Button variant="secondary" className="mt-3" onClick={cancel}>Cancel search</Button>}
    </>}
    <div role="status" className="mt-3 break-words">
      {busy === "generate" ? "Searching for weekly placements…" : busy === "save" ? "Saving generated draft…" : stale
        ? "The schedule or teaching records changed. Refresh the semester and generate again."
        : feedback?.message ?? (proposal && `${proposal.summary.placed} of ${proposal.summary.required} weekly periods placed · ${searchLabels[proposal.summary.status]}.`)}
    </div>
    {stale && <Button variant="secondary" className="mt-3" onClick={() => { clearProposal(); router.refresh(); }}>Refresh semester</Button>}
    {proposal && <div className="mt-4 border-t border-border-subtle pt-4">
      <ProposalReview summary={proposal.summary} revision={proposal.revision} />
      {proposal.token && <Button className="mt-4" disabled={!!busy || stale} onClick={save}>Open as draft</Button>}
    </div>}
  </section>;
}

function ProposalReview({ summary, revision }: { summary: GenerationSummary; revision: number }) {
  const incomplete = summary.coverage.filter(row => row.placed < row.required);
  const labels = new Map(summary.coverage.map(row => [row.allocationId, `${row.course} · ${row.section}`]));
  return <section aria-labelledby="proposal-heading" className="grid gap-3">
    <h3 id="proposal-heading" className="font-semibold">{incomplete.length ? "Partial proposal" : "All weekly periods placed"}</h3>
    <p>{summary.runtimeMs} ms search · revision {revision}.</p>
    <p className="text-sm text-text-secondary">{summary.fixedCount} published weekly placements retained. Quality measures use lower counts for better results.</p>
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <div><dt>Same-allocation class pairs on one day</dt><dd className="font-semibold">{summary.quality.sameDayPairs}</dd></div>
      <div><dt>Theory classes using labs</dt><dd className="font-semibold">{summary.quality.theoryInLab}</dd></div>
    </dl>
    {!!incomplete.length && <div className="rounded-control border border-warning p-3">
      <h4 className="font-semibold">Unresolved allocations</h4>
      <p className="my-2">Publication requires every weekly allocation to be filled. This search leaves open whether more placements are possible.</p>
      <ul className="list-disc break-words pl-5">{incomplete.map(row => <li key={row.allocationId}>
        {row.course} · {row.section} · {row.placed} of {row.required} periods placed
      </li>)}</ul>
    </div>}
    {summary.entries.length > 0 && <details>
      <summary className="cursor-pointer font-medium">Review {summary.entries.length} proposed weekly placements</summary>
      <ul className="mt-2 grid gap-2">{summary.entries.map(row => <li key={row.id} className="break-words border-b border-border-subtle pb-2">
        {labels.get(row.allocationId)} · {days[row.weekday]} {clockTime(row.startMinute)}–{clockTime(row.endMinute)} · {row.room}
      </li>)}</ul>
    </details>}
  </section>;
}
