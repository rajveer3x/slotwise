import "server-only";
import { createHash, randomBytes } from "node:crypto";
import ical, { ICalEventStatus, ICalEventTransparency } from "ical-generator";
import { calendarChange, type CalendarChange, type CalendarFeedCard, type CalendarResult } from "@/features/calendar-feeds/schema";
import { authConfig } from "@/server/auth/config";
import { AccessError } from "@/server/auth/session";
import { getDb } from "@/server/db";
import type { Tx } from "./scheduling-store";

const cancellationRetentionMs = 30 * 24 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
// RFC 5545 TEXT allows tabs and escaped newlines but excludes other ASCII control characters.
const calendarText = (text: string) => Array.from(text).filter(character => {
  const code = character.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
}).join("");
const actorFields = { id: true, active: true, role: true, departmentId: true } as const;
type Scope = Pick<CalendarChange, "scope" | "scopeId">;

async function calendarActor(tx: Tx, actorId: string | null) {
  const actor = actorId ? await tx.user.findUnique({ where: { id: actorId }, select: actorFields }) : null;
  if (!actor?.active) throw new AccessError("UNAUTHORIZED");
  return actor;
}

async function allowedScopes(tx: Tx, actor: Awaited<ReturnType<typeof calendarActor>>): Promise<(Scope & { label: string })[]> {
  const { departmentId, id: userId } = actor;
  if (!actor.active) return [];
  if (actor.role === "STUDENT") {
    const memberships = await tx.sectionMembership.findMany({
      where: { userId, departmentId, archived: false, section: { archived: false, semester: { archived: false } } },
      select: { section: { select: { id: true, code: true, semester: { select: { name: true } } } } },
      orderBy: [{ section: { semester: { startDate: "desc" } } }, { section: { code: "asc" } }, { sectionId: "asc" }],
    });
    return memberships.map(({ section }) => ({ scope: "SECTION", scopeId: section.id, label: `${section.code} · ${section.semester.name}` }));
  }
  if (actor.role === "FACULTY" || actor.role === "HOD") {
    const faculty = await tx.faculty.findFirst({ where: { userId, departmentId, archived: false }, select: { id: true } });
    return faculty ? [{ scope: "FACULTY", scopeId: faculty.id, label: "My teaching schedule" }] : [];
  }
  return [];
}

const sameScope = (a: Scope, b: Scope) => a.scope === b.scope && a.scopeId === b.scopeId;

export async function readCalendarSubscriptions(actorId: string | null): Promise<CalendarFeedCard[]> {
  return getDb().$transaction(async tx => {
    const actor = await calendarActor(tx, actorId);
    const scopes = await allowedScopes(tx, actor);
    const subscriptions = await tx.calendarSubscription.findMany({
      where: { ownerId: actor.id, departmentId: actor.departmentId },
      select: { scope: true, scopeId: true, tokenHash: true, version: true },
    });
    const cards = scopes.map(scope => {
      const subscription = subscriptions.find(row => sameScope(row, scope));
      return { ...scope, allowed: true, active: Boolean(subscription?.tokenHash), version: subscription?.version ?? 0 };
    });
    for (const { scope, scopeId, version, tokenHash } of subscriptions) {
      if (tokenHash && !scopes.some(item => sameScope(item, { scope, scopeId }))) {
        cards.push({ scope, scopeId, version, label: "Former calendar scope", allowed: false, active: true });
      }
    }
    return cards;
  }, { isolationLevel: "RepeatableRead" });
}

export async function changeCalendarSubscription(actorId: string | null, input: unknown): Promise<CalendarResult> {
  try {
    if (!actorId) throw new AccessError("UNAUTHORIZED");
    const command = calendarChange.safeParse(input);
    if (!command.success) return { ok: false, code: "VALIDATION_ERROR", message: "Choose a valid calendar scope and action." };
    const { operation, scope, scopeId, expectedVersion } = command.data;

    return await getDb().$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await calendarActor(tx, actorId);
      await tx.$queryRaw`SELECT id FROM "Department" WHERE id = ${actor.departmentId} FOR UPDATE`;

      const existing = await tx.calendarSubscription.findUnique({
        where: { ownerId_scope_scopeId: { ownerId: actor.id, scope, scopeId } },
        select: { id: true, departmentId: true, tokenHash: true, version: true },
      });
      // A former scope can still be revoked by its owner.
      if (existing && existing.departmentId !== actor.departmentId) throw new AccessError("FORBIDDEN");
      if (operation === "revoke" ? !existing : !(await allowedScopes(tx, actor)).some(item => sameScope(item, command.data))) {
        throw new AccessError("FORBIDDEN");
      }
      if ((existing?.version ?? 0) !== expectedVersion || (operation === "create" ? Boolean(existing?.tokenHash) : !existing?.tokenHash)) {
        return { ok: false, code: "STALE_VERSION", message: "This subscription changed. Refresh before trying again." };
      }

      // A version can be consumed only once. A retry cannot rotate again or recover a secret.
      const token = operation === "revoke" ? null : randomBytes(32).toString("base64url");
      const tokenHash = token ? hashToken(token) : null;
      const url = token ? new URL(`/api/calendar/${token}.ics`, authConfig().origin).href : undefined;
      const version = expectedVersion + 1;
      if (existing) {
        await tx.calendarSubscription.update({ where: { id: existing.id }, data: { tokenHash, version } });
      } else {
        await tx.calendarSubscription.create({ data: { ownerId: actor.id, departmentId: actor.departmentId, scope, scopeId, tokenHash, version } });
      }
      const message = operation === "create" ? "Subscription created." : operation === "rotate" ? "Link rotated. The previous link was revoked." : "Subscription revoked.";
      return { ok: true, message, version, url };
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return { ok: false, code: error.code, message: error.code === "UNAUTHORIZED" ? "Sign in again to manage calendar feeds." : "This calendar scope is unavailable to your account." };
    }
    // Keep errors involving credentials out of logs and action results.
    return { ok: false, code: "UNAVAILABLE", message: "Could not update the subscription. Refresh before trying again." };
  }
}

export async function readCalendarFeed(key: string) {
  if (!/^[A-Za-z0-9_-]{43}\.ics$/.test(key)) return null;
  const tokenHash = hashToken(key.slice(0, -4));
  const events = await getDb().$transaction(async tx => {
    const subscription = await tx.calendarSubscription.findUnique({
      where: { tokenHash },
      select: { scope: true, scopeId: true, departmentId: true, owner: { select: actorFields } },
    });
    if (!subscription || subscription.owner.departmentId !== subscription.departmentId ||
      !(await allowedScopes(tx, subscription.owner)).some(scope => sameScope(scope, subscription))) return null;

    const cutoff = new Date(Date.now() - cancellationRetentionMs);
    return tx.classOccurrence.findMany({
      where: {
        departmentId: subscription.departmentId,
        ...(subscription.scope === "FACULTY" ? { facultyId: subscription.scopeId } : { sectionId: subscription.scopeId }),
        section: { archived: false },
        entry: { timetableVersion: { status: "PUBLISHED", semester: { archived: false } } },
        OR: [{ schedulingStatus: "ACTIVE" }, { schedulingStatus: "CANCELLED", cancelledAt: { gte: cutoff } }],
      },
      select: {
        teachingObligationId: true, startAt: true, endAt: true, schedulingStatus: true, cancelledAt: true,
        section: { select: { code: true } },
        room: { select: { code: true } },
        entry: { select: { timetableVersion: { select: { publishedAt: true, semester: { select: { scheduleRevision: true } } } } } },
        publication: { select: { createdAt: true } },
        teachingObligation: { select: { allocation: { select: { course: { select: { code: true, name: true } } } } } },
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });
  }, { isolationLevel: "RepeatableRead" });
  if (!events) return null;

  const publishedAt = (event: (typeof events)[number]) =>
    event.publication?.createdAt ?? event.entry.timetableVersion.publishedAt ?? event.startAt;
  const assignments = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    const current = assignments.get(event.teachingObligationId);
    // Prefer an assignment still in the feed's scope. A teacher who lost the
    // assignment gets a tombstone at their old time without seeing the replacement.
    if (!current || event.schedulingStatus === "ACTIVE" ||
      (current.cancelledAt && event.cancelledAt &&
        (event.cancelledAt > current.cancelledAt ||
          (event.cancelledAt.getTime() === current.cancelledAt.getTime() && publishedAt(event) > publishedAt(current))))) {
      assignments.set(event.teachingObligationId, event);
    }
  }

  const calendar = ical({ name: "SlotWise timetable", prodId: { company: "SlotWise", product: "Calendar feeds" } });
  for (const event of assignments.values()) {
    const cancelled = event.schedulingStatus === "CANCELLED";
    const { course } = event.teachingObligation.allocation;
    const version = event.entry.timetableVersion;
    calendar.createEvent({
      id: `${event.teachingObligationId}@slotwise`,
      start: event.startAt,
      end: event.endAt,
      stamp: event.cancelledAt ?? publishedAt(event),
      sequence: version.semester.scheduleRevision,
      summary: cancelled ? "Cancelled class" : calendarText(`${course.code} · ${course.name}`),
      description: cancelled ? undefined : calendarText(`Section ${event.section.code}`),
      location: cancelled ? undefined : calendarText(event.room?.code ?? "Online"),
      status: cancelled ? ICalEventStatus.CANCELLED : ICalEventStatus.CONFIRMED,
      transparency: cancelled ? ICalEventTransparency.TRANSPARENT : ICalEventTransparency.OPAQUE,
    });
  }
  return `${calendar.toString()}\r\n`;
}
