import { maxDraftEntries, placementConflicts, slotSpan, type Placement, type SchedulingData } from "./timetable";

export const generationPolicy = {
  version: "weekly-v1",
  timeoutMs: 400,
  workLimit: 30_000,
  improvementLimit: 1_500,
  maxAllocations: 120,
  maxPeriods: maxDraftEntries,
  maxSlots: 150,
  maxRooms: 30,
  maxRelatedRecords: 600,
} as const;

export type SearchStatus = "finished" | "timeout" | "cancelled" | "work-limit";
type Quality = { sameDayPairs: number; theoryInLab: number };
type Candidate = { placement: Placement; periods: number; tie: number };
type Allocation = SchedulingData["allocations"][number];
type Task = { allocation: Allocation; needed: number; candidates: Candidate[] };
type SearchControl = {
  now: () => number;
  signal?: AbortSignal;
  pause?: () => Promise<void>;
  timeoutMs?: number;
  workLimit?: number;
};

function seedOrder(seed: number, fields: (string | number)[]) {
  let hash = (2166136261 ^ seed) >>> 0;
  for (const char of fields.join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export async function generateWeekly(
  data: SchedulingData, semesterId: string, fixed: Placement[], seed: number, control: SearchControl,
) {
  const { now, signal, pause } = control;
  const started = now(), deadline = started + (control.timeoutMs ?? generationPolicy.timeoutMs);
  const limit = control.workLimit ?? generationPolicy.workLimit;
  let work = 0, stop: SearchStatus | undefined;
  function canContinue() {
    if (!stop) {
      if (signal?.aborted) stop = "cancelled";
      else if (now() >= deadline) stop = "timeout";
      else if (work >= limit) stop = "work-limit";
    }
    return !stop;
  }
  async function step() {
    if (pause && work % 64 === 0 && !stop) await pause();
    if (!canContinue()) return false;
    work++;
    return true;
  }

  const allocations = data.allocations.filter(a => a.semesterId === semesterId && !a.archived)
    .sort((a, b) => a.id.localeCompare(b.id));
  const courses = new Map(data.courses.map(c => [c.id, c]));
  const labs = new Set(allocations.filter(a => courses.get(a.courseId)?.type === "LAB").map(a => a.id));
  const labRooms = new Set(data.rooms.filter(r => r.type === "LAB").map(r => r.id));
  const required = allocations.reduce((sum, a) => sum + a.weeklyPeriods, 0);
  const baseline = [...fixed].sort((a, b) => a.seriesId.localeCompare(b.seriesId));
  const fixedCount = new Map<string, number>();
  for (const p of baseline) fixedCount.set(p.allocationId, (fixedCount.get(p.allocationId) ?? 0) + slotSpan(p, data));
  let best = [...baseline], placed = [...fixedCount.values()].reduce((sum, n) => sum + n, 0);
  const tasks: Task[] = allocations.flatMap(allocation => {
    const needed = allocation.weeklyPeriods - (fixedCount.get(allocation.id) ?? 0);
    return needed > 0 ? [{ allocation, needed, candidates: [] }] : [];
  });
  const slots = data.slots.filter(s => !s.archived && s.weekday >= 1 && s.weekday <= 5)
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.id.localeCompare(b.id));
  const rooms = data.rooms.filter(r => !r.archived).sort((a, b) => a.id.localeCompare(b.id));

  // Build the room/slot choices against the immutable baseline. Check the shared
  // placement rules again against the growing schedule when exploring a choice.
  for (const task of tasks) {
    const isLab = labs.has(task.allocation.id);
    for (const [startIndex, start] of slots.entries()) {
      for (let periods = 1; periods <= (isLab ? task.needed : 1); periods++) {
        const endIndex = startIndex + periods - 1;
        const end = slots[endIndex], previous = slots[endIndex - 1];
        if (!end || end.weekday !== start.weekday || (periods > 1 && previous.endMinute !== end.startMinute)) break;
        if (isLab && periods < 2) continue;
        for (const room of rooms) {
          if (!await step()) break;
          const placement = {
            seriesId: "", allocationId: task.allocation.id, roomId: room.id,
            weekday: start.weekday, startMinute: start.startMinute, endMinute: end.endMinute,
          };
          if (slotSpan(placement, data) === periods && !placementConflicts(placement, baseline, data).length) {
            task.candidates.push({ placement, periods, tie: seedOrder(seed, [task.allocation.id, start.id, end.id, room.id]) });
          }
        }
        if (stop) break;
      }
      if (stop) break;
    }
    task.candidates.sort((a, b) => b.periods - a.periods || a.tie - b.tie);
    if (stop) break;
  }

  tasks.sort((a, b) => a.candidates.length / a.needed - b.candidates.length / b.needed
    || b.needed - a.needed || a.allocation.id.localeCompare(b.allocation.id));
  const schedule = [...baseline];
  let count = placed;
  function keepBest() {
    if (count > placed) {
      best = [...schedule];
      placed = count;
    }
  }
  function fits(candidate: Candidate, remaining: number) {
    return candidate.periods <= remaining
      && !placementConflicts(candidate.placement, schedule, data).length;
  }

  // First make one greedy pass in difficulty order.
  if (!stop) {
    for (const task of tasks) {
      let remaining = task.needed;
      for (const candidate of task.candidates) {
        if (!remaining || !await step()) break;
        if (!fits(candidate, remaining)) continue;
        schedule.push(candidate.placement);
        count += candidate.periods;
        remaining -= candidate.periods;
      }
      if (stop) break;
    }
    keepBest();
  }

  // Revisit earlier choices if the greedy pass leaves work. Increasing option
  // indices avoid exploring permutations of the same choices for an allocation.
  async function backtrack(index: number, remaining: number, first: number): Promise<boolean> {
    if (count === required) return true;
    const task = tasks[index];
    if (!task || !await step()) return false;
    for (let i = first; remaining && i < task.candidates.length; i++) {
      if (!await step()) return false;
      const candidate = task.candidates[i];
      if (!fits(candidate, remaining)) continue;
      schedule.push(candidate.placement);
      count += candidate.periods;
      keepBest();
      const left = remaining - candidate.periods;
      const found = left
        ? await backtrack(index, left, i + 1)
        : await backtrack(index + 1, tasks[index + 1]?.needed ?? 0, 0);
      schedule.pop();
      count -= candidate.periods;
      if (found || stop) return found;
    }
    return backtrack(index + 1, tasks[index + 1]?.needed ?? 0, 0);
  }
  if (!stop && placed < required) {
    schedule.length = fixed.length;
    count = [...fixedCount.values()].reduce((sum, n) => sum + n, 0);
    await backtrack(0, tasks[0]?.needed ?? 0, 0);
  }

  function cost(p: Placement, others: Placement[]): Quality {
    return {
      sameDayPairs: others.filter(o => p.allocationId === o.allocationId && p.weekday === o.weekday).length,
      theoryInLab: !labs.has(p.allocationId) && labRooms.has(p.roomId) ? 1 : 0,
    };
  }
  // One local repair pass. Keep coverage fixed and improve spread first, then
  // preserve lab capacity for labs. Each replacement uses the shared validator.
  const choices = new Map(tasks.map(t => [t.allocation.id, t.candidates]));
  let improvementsChecked = 0;
  improve: for (let i = fixed.length; !stop && i < best.length; i++) {
    const current = best[i], others = best.filter((_, j) => j !== i);
    const before = cost(current, others), span = slotSpan(current, data);
    for (const candidate of choices.get(current.allocationId) ?? []) {
      if (improvementsChecked >= generationPolicy.improvementLimit || !await step()) break improve;
      improvementsChecked++;
      if (candidate.periods !== span) continue;
      const after = cost(candidate.placement, others);
      const improves = after.sameDayPairs < before.sameDayPairs
        || (after.sameDayPairs === before.sameDayPairs && after.theoryInLab < before.theoryInLab);
      if (!improves || placementConflicts(candidate.placement, others, data).length) continue;
      best[i] = candidate.placement;
      break;
    }
  }

  const quality = best.reduce((q, p, i) => {
    const added = cost(p, best.slice(0, i));
    return { sameDayPairs: q.sameDayPairs + added.sameDayPairs, theoryInLab: q.theoryInLab + added.theoryInLab };
  }, { sameDayPairs: 0, theoryInLab: 0 });
  const units = new Set(fixed.map(p => p.seriesId));
  let serial = 0;
  const entries = best.map(p => {
    if (p.seriesId) return p;
    let seriesId: string;
    do { seriesId = `proposal-${++serial}`; } while (units.has(seriesId));
    return { ...p, seriesId };
  });
  const coverage = allocations.map(a => ({
    allocationId: a.id, required: a.weeklyPeriods,
    placed: entries.filter(p => p.allocationId === a.id).reduce((sum, p) => sum + slotSpan(p, data), 0),
  }));
  // Recheck cancellation/time after the final work, without treating an exactly
  // consumed work budget as a limit unless a further step was needed.
  if (!stop) {
    if (signal?.aborted) stop = "cancelled";
    else if (now() >= deadline) stop = "timeout";
  }
  return { entries, coverage, required, placed, quality, status: stop ?? "finished",
    work, runtimeMs: Math.ceil(now() - started) };
}
