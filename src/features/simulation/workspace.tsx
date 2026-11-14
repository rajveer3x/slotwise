"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockTime } from "@/domain/scheduling/timetable";
import { computeSimulation, refreshSimulationBaseline } from "./actions";
import type { ClassSummary, Scenario, SimulationResult } from "./schema";

const localTimestamp = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium",
});

function ClassDetails({ assignments, showCourse = false }: { assignments: ClassSummary[]; showCourse?: boolean }) {
  return <ul className="grid gap-2">{assignments.map((a, index) => <li key={index}>
    {showCourse && <p className="font-medium">{a.course} · {a.section}</p>}
    <p className="text-sm text-text-secondary">{a.date} · {clockTime(a.start)}–{clockTime(a.end)}</p>
    <p className="text-sm text-text-secondary">{a.faculty} · {a.room}</p>
  </li>)}</ul>;
}

function Results({ result }: { result: SimulationResult }) {
  const { baseline, items, workload, resource, scenario } = result;
  const possible = items.filter(item => item.candidates.length).length;
  const searchComplete = items.every(item => item.searchComplete);
  const { policy } = baseline;
  return <section className="schedule-panel mt-5 grid grid-cols-1 gap-5" aria-labelledby="simulation-results">
    <header>
      <p className="inline-block rounded-full bg-info-tint px-3 py-1 text-sm font-medium text-info">Read-only simulation</p>
      <h2 id="simulation-results" className="mt-2 text-lg">Simulation results</h2>
      <p className="text-sm text-text-secondary">{scenario.kind === "room" ? "Room closure" : "Faculty absence"} · {resource} · {scenario.startDate} to {scenario.endDate}</p>
      <p className="mt-2 text-sm text-text-secondary">Baseline captured {localTimestamp.format(new Date(baseline.computedAt))} · Asia/Kolkata</p>
      <ul className="text-sm text-text-secondary">
        {baseline.revisions.map((row, i) => <li key={i}>{row.name} · Revision {row.revision}</li>)}
      </ul>
    </header>

    <details className="rounded-xl bg-surface-subtle p-3 text-sm">
      <summary className="cursor-pointer font-medium">Baseline policy values</summary>
      <p className="mt-2">{policy.version} · {policy.searchDays} calendar days after each class, within its semester · {policy.maxAttemptsPerItem.toLocaleString("en-IN")} attempts per class.</p>
      <p>Online teaching {policy.onlineEnabled ? "enabled for theory" : "disabled"} · Saturday requires HoD approval.</p>
      <p>Slot scoring uses {policy.gap} for filling a gap, {policy.adjacent} for adjacency, {policy.excessPeriod} per period above the daily preference, {policy.finalPeriod} for the final period and {policy.delayDay} per day of delay.</p>
    </details>

    <div className="flex flex-wrap gap-2 text-sm">
      <span className="rounded-full bg-primary-tint px-3 py-1">{items.length} affected</span>
      <span className="rounded-full bg-lime px-3 py-1">{possible} with a possible recovery</span>
      <span className="rounded-full bg-warning-tint px-3 py-1 text-warning">{items.length - possible} unresolved</span>
    </div>
    {items.length > 0 && <p className={searchComplete ? "text-sm text-text-secondary" : "rounded-xl bg-warning-tint p-3 text-sm text-warning"}>
      {searchComplete
        ? "Search finished within the configured limits. Workload uses the first ranked recovery for each class in date and time order."
        : "Search incomplete. The attempt limit was reached for at least one class. The projection uses the options found so far."}
    </p>}
    {!items.length && <p>No upcoming published classes match this disruption.</p>}
    {items.map(item => {
      const [projected, ...alternatives] = item.candidates;
      return <article key={item.id} className="schedule-panel grid gap-3">
        <h3>{item.original.course} · {item.original.section}</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-surface-subtle p-3">
            <h4 className="mb-2 text-sm font-semibold">Published baseline</h4>
            <ClassDetails assignments={[item.original]} />
          </div>
          <div className={`rounded-xl p-3 ${projected ? "bg-info-tint" : "bg-warning-tint"}`}>
            <h4 className="mb-2 text-sm font-semibold">{projected ? `Projected recovery · ${projected.tier}` : "Unresolved"}</h4>
            {projected ? <>
              <ClassDetails assignments={projected.assignments} showCourse={projected.assignments.length > 1} />
              <p className="mt-2 text-sm text-text-secondary">{projected.why}</p>
              {projected.requires && <p className="mt-1 text-sm text-warning">{projected.requires}</p>}
            </> : <p className="text-sm text-warning">{item.searchComplete ? "No feasible option in the configured search window." : "No feasible option found before the search limit."}</p>}
          </div>
        </div>
        {!item.searchComplete && <p className="text-sm text-warning">Search incomplete for this class.</p>}
        {alternatives.length > 0 && <details className="text-sm">
          <summary className="cursor-pointer font-medium">Other options at this tier ({alternatives.length})</summary>
          <p className="my-2 text-text-secondary">Choosing a different option would require recalculating later recoveries.</p>
          <ol className="grid gap-3 pl-3">{alternatives.map((candidate, i) => <li key={i}>
            <ClassDetails assignments={candidate.assignments} showCourse={candidate.assignments.length > 1} />
            <p className="text-text-secondary">{candidate.why}</p>
            {candidate.requires && <p className="text-warning">{candidate.requires}</p>}
          </li>)}</ol>
        </details>}
        {item.blockers.length > 0 && <details className="text-sm">
          <summary className="cursor-pointer font-medium">Why other options were ruled out</summary>
          <ul className="mt-2 list-disc pl-5">{item.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </details>}
      </article>;
    })}
    {workload.length > 0 && <section aria-labelledby="simulation-workload">
      <h3 id="simulation-workload" className="text-base">Weekly planned workload</h3>
      <p className="mb-3 text-sm text-text-secondary">Minutes for affected faculty and any teachers in the projected recoveries.</p>
      <div role="region" aria-labelledby="simulation-workload" tabIndex={0} className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
          <thead className="bg-surface-subtle"><tr>
            {["Week of", "Faculty", "Target", "Baseline", "Projected", "Change"].map(label =>
              <th key={label} scope="col" className="p-3">{label}</th>)}
          </tr></thead>
          <tbody>{workload.map(row => {
            const change = row.projected - row.baseline;
            return <tr key={row.key} className="border-t border-border-subtle">
              <td className="whitespace-nowrap p-3">{row.week}</td><th scope="row" className="p-3 font-medium">{row.faculty}</th>
              <td className="p-3">{row.target || "—"}</td><td className="p-3">{row.baseline}</td>
              <td className="p-3">{row.projected}</td><td className="p-3">{change > 0 ? `+${change}` : change}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
  </section>;
}

type Resource = { id: string; label: string };

export function SimulationWorkspace({ departmentId, today, defaultDate, rooms, faculty }: {
  departmentId: string; today: string; defaultDate: string | null; rooms: Resource[]; faculty: Resource[];
}) {
  const [kind, setKind] = useState<Scenario["kind"]>(rooms.length ? "room" : "faculty");
  const [resourceId, setResourceId] = useState("");
  const [startDate, setStartDate] = useState(defaultDate ?? "");
  const [endDate, setEndDate] = useState(defaultDate ?? "");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [operation, setOperation] = useState<"run" | "check">("run");
  const [pending, startTransition] = useTransition();
  const options = kind === "room" ? rooms : faculty;
  const canRun = !!defaultDate && (rooms.length > 0 || faculty.length > 0);
  const edited = result && (result.scenario.kind !== kind || result.scenario.resourceId !== resourceId
    || result.scenario.startDate !== startDate || result.scenario.endDate !== endDate);

  function run(scenario: Scenario) {
    setOperation("run");
    setError("");
    setStatus("");
    startTransition(async () => {
      try {
        const response = await computeSimulation(scenario);
        if (!response.ok) {
          if (["UNAUTHORIZED", "FORBIDDEN"].includes(response.code)) setResult(null);
          setError(response.message);
          return;
        }
        setResult(response.result);
        setStale(false);
        setStatus("Simulation complete.");
      } catch {
        setError("Could not run the simulation. Try again.");
      }
    });
  }

  function check() {
    if (!result) return;
    setOperation("check");
    setError("");
    setStatus("");
    startTransition(async () => {
      try {
        const response = await refreshSimulationBaseline({ departmentId, token: result.baseline.token });
        if (!response.ok) {
          if (["UNAUTHORIZED", "FORBIDDEN"].includes(response.code)) setResult(null);
          setError(response.message);
          return;
        }
        setStale(response.stale);
        if (!response.stale) setStatus("Baseline matched the current schedule and policy at the last check.");
      } catch {
        setError("Could not check the baseline. Try again.");
      }
    });
  }

  return <>
    <section className="schedule-panel mt-6" aria-labelledby="scenario-title">
      <h2 id="scenario-title" className="text-lg">Scenario</h2>
      {!canRun ? <p className="mt-2">{!defaultDate ? "No current or future semester is configured." : "No rooms or faculty are available to simulate."}</p> :
        <form className="mt-3 grid gap-3" onSubmit={event => {
          event.preventDefault();
          run({ departmentId, kind, resourceId, startDate, endDate });
        }}>
          <fieldset className="schedule-form" disabled={pending}>
            <div className="grid min-w-0 gap-2"><label htmlFor="simulation-kind">Disruption</label><select id="simulation-kind" className="input" value={kind} onChange={event => {
              setKind(event.target.value === "room" ? "room" : "faculty");
              setResourceId("");
            }}>
              <option value="room" disabled={!rooms.length}>Room closure</option>
              <option value="faculty" disabled={!faculty.length}>Faculty absence</option>
            </select></div>
            <div className="grid min-w-0 gap-2"><label htmlFor="simulation-resource">{kind === "room" ? "Room" : "Faculty"}</label><select id="simulation-resource" className="input" value={resourceId} required onChange={event => setResourceId(event.target.value)}>
              <option value="">Choose {kind === "room" ? "a room" : "a faculty member"}</option>
              {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select></div>
            <label>Start date<Input type="date" min={today} required value={startDate} onChange={event => setStartDate(event.target.value)} aria-describedby="simulation-interval" /></label>
            <label>End date<Input type="date" min={startDate || today} required value={endDate} onChange={event => setEndDate(event.target.value)} aria-describedby="simulation-interval" /></label>
          </fieldset>
          <p id="simulation-interval" className="text-sm text-text-secondary">Choose up to 31 full days within one semester. Both dates are included.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{pending && operation === "run" ? "Simulating…" : "Run simulation"}</Button>
            {result && <Button variant="secondary" disabled={pending} onClick={check}>{pending && operation === "check" ? "Checking…" : "Check baseline"}</Button>}
          </div>
        </form>}
      {edited && <p className="mt-2 text-sm text-text-secondary">The result below is for the previous inputs. Run the edited scenario to update it.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-tint p-3 text-sm text-danger">{error}</p>}
      <div role="status" className="text-sm text-text-secondary">
        {status && <p className="mt-3">{status}</p>}
        {stale && result && <p className="mt-3 rounded-xl bg-warning-tint p-3 text-warning">Stale simulation. The baseline has changed since this run.</p>}
      </div>
      {stale && result && <Button className="mt-2" variant="secondary" disabled={pending} onClick={() => {
        setKind(result.scenario.kind);
        setResourceId(result.scenario.resourceId);
        setStartDate(result.scenario.startDate);
        setEndDate(result.scenario.endDate);
        run(result.scenario);
      }}>Recompute this scenario</Button>}
    </section>
    {result && <Results result={result} />}
  </>;
}
