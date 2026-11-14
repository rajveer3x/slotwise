import "server-only";
import { z } from "zod";
import { clockTime } from "@/domain/scheduling/timetable";
import { getDb } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { AccessError, actorSelect } from "@/server/auth/session";

const id = z.string().min(1).max(100);
const command = z.object({ notificationId: id, operation: z.enum(["read", "acknowledge"]) }).strict();
const assignment = z.object({
  obligationId: id,
  allocationId: id,
  facultyId: id,
  sectionId: id,
  roomId: id.nullable(),
  date: z.iso.date(),
  startMinute: z.number(),
  endMinute: z.number(),
});
const snapshot = z.object({
  changes: z.array(z.object({ before: assignment, after: assignment })),
  labels: z.record(z.string(), z.string()),
});

async function activeActor(tx: Prisma.TransactionClient, actorId: string | null) {
  const actor = actorId && await tx.user.findUnique({ where: { id: actorId }, select: actorSelect });
  if (!actor || !actor.active) throw new AccessError("UNAUTHORIZED");
  return actor;
}

const detailSelect = {
  id: true, message: true, createdAt: true, readAt: true, affectedObligationIds: true,
  acknowledgement: { select: { acknowledgedAt: true } },
  publication: {
    select: {
      details: true,
      occurrences: { select: { id: true, teachingObligationId: true, schedulingStatus: true } },
    },
  },
} as const;

async function notificationView(
  tx: Prisma.TransactionClient,
  actor: Awaited<ReturnType<typeof activeActor>>,
  notices: Prisma.NotificationGetPayload<{ select: typeof detailSelect }>[],
) {
  const { departmentId } = actor;
  // Earlier publications stored the audience but lacked per-recipient class scope.
  const needsLegacyScope = notices.some(n => n.publication && !n.affectedObligationIds.length);
  const memberships = needsLegacyScope && actor.role === "STUDENT"
    ? await tx.sectionMembership.findMany({
      where: { departmentId, userId: actor.id, archived: false },
      select: { sectionId: true },
    })
    : [];
  const sections = new Set(memberships.map(m => m.sectionId));
  const faculty = needsLegacyScope && actor.role === "FACULTY"
    ? await tx.faculty.findUnique({ where: { userId: actor.id }, select: { id: true } })
    : null;

  const prepared = notices.map(notice => {
    const details = snapshot.safeParse(notice.publication?.details);
    const scope = new Set(notice.affectedObligationIds);
    const changes = details.success ? details.data.changes.filter(({ before, after }) =>
      scope.size ? scope.has(after.obligationId)
        : actor.role === "STUDENT" ? sections.has(after.sectionId)
        : actor.role === "FACULTY" ? before.facultyId === faculty?.id || after.facultyId === faculty?.id
          : true) : [];
    return { notice, changes, labels: details.data?.labels ?? {} };
  });

  const obligationIds = [...new Set(prepared.flatMap(p => p.changes.map(c => c.after.obligationId)))];
  const currentRows = obligationIds.length ? await tx.classOccurrence.findMany({
    where: { departmentId, teachingObligationId: { in: obligationIds }, schedulingStatus: "ACTIVE" },
    select: { id: true, teachingObligationId: true, localDate: true, entry: { select: { timetableVersion: {
      select: { semesterId: true, semester: { select: { archived: true } } },
    } } } },
  }) : [];
  const currentByObligation = new Map(currentRows.map(o => [o.teachingObligationId, o]));

  return prepared.map(({ notice, changes, labels }) => {
    const publishedByObligation = new Map(notice.publication?.occurrences.map(o => [o.teachingObligationId, o]));
    const describe = (a: z.infer<typeof assignment>) =>
      `${a.date} · ${clockTime(a.startMinute)}–${clockTime(a.endMinute)} · ${labels[a.facultyId] ?? "Teacher"} · ${a.roomId ? labels[a.roomId] ?? "Room" : "Online"}`;

    return {
      id: notice.id,
      message: notice.publication ? "Schedule recovery published." : notice.message,
      createdAt: notice.createdAt.toISOString(),
      read: notice.readAt !== null,
      canAcknowledge: notice.publication !== null,
      acknowledgedAt: notice.acknowledgement?.acknowledgedAt.toISOString() ?? null,
      href: notice.message.startsWith("Recovery request:") ? "/cover-requests" : "/timetable",
      changes: changes.map(({ before, after }) => {
        const current = currentByObligation.get(after.obligationId);
        const version = current?.entry.timetableVersion;
        const published = publishedByObligation.get(after.obligationId);
        return {
          id: after.obligationId,
          title: [labels[after.allocationId], labels[after.sectionId]].filter(Boolean).join(" · ") || "Class change",
          before: describe(before),
          after: describe(after),
          status: current && current.id !== published?.id ? "Historical assignment · superseded"
            : published?.schedulingStatus === "ACTIVE" && !version?.semester.archived ? "Published assignment"
              : "Historical assignment · off the current timetable",
          timetableHref: current && version && !version.semester.archived
            ? `/timetable?${new URLSearchParams({ semester: version.semesterId, week: current.localDate })}`
            : "/timetable",
        };
      }),
    };
  });
}

export async function readNotification(actorId: string | null, notificationId: string) {
  return getDb().$transaction(async tx => {
    const actor = await activeActor(tx, actorId);
    const notice = await tx.notification.findFirst({
      where: { id: notificationId, recipientId: actor.id, departmentId: actor.departmentId },
      select: detailSelect,
    });
    if (!notice) throw new AccessError("FORBIDDEN");
    return (await notificationView(tx, actor, [notice]))[0];
  }, { isolationLevel: "RepeatableRead" });
}

export async function readNotificationInbox(actorId: string | null, requestedPage = 1) {
  return getDb().$transaction(async tx => {
    const actor = await activeActor(tx, actorId);
    const where = { departmentId: actor.departmentId, recipientId: actor.id };
    const pageSize = 25;
    const total = await tx.notification.count({ where });
    const unread = await tx.notification.count({ where: { ...where, readAt: null } });
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pages);
    const notices = await tx.notification.findMany({
      where, select: detailSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize, take: pageSize,
    });
    return { unread, page, pages, notices: await notificationView(tx, actor, notices) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function readAcknowledgementCounts(actorId: string | null) {
  return getDb().$transaction(async tx => {
    const actor = await activeActor(tx, actorId);
    if (actor.role !== "COORDINATOR" && actor.role !== "ADMIN") throw new AccessError("FORBIDDEN");
    const publications = await tx.schedulePublication.findMany({
      where: { departmentId: actor.departmentId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, createdAt: true,
        notifications: { where: { recipientId: actor.id }, select: { id: true } },
        _count: { select: { notifications: true, occurrences: true } },
      },
    });
    const counts = await tx.publicationAcknowledgement.groupBy({
      by: ["publicationId"], where: { notification: { departmentId: actor.departmentId } }, _count: true,
    });
    const acknowledged = new Map(counts.map(c => [c.publicationId, c._count]));
    return publications.map(p => ({
      id: p.id, createdAt: p.createdAt.toISOString(), classes: p._count.occurrences,
      recipients: p._count.notifications, acknowledged: acknowledged.get(p.id) ?? 0,
      ownNotificationId: p.notifications[0]?.id,
    }));
  }, { isolationLevel: "RepeatableRead" });
}

export async function changeNotification(actorId: string | null, input: unknown) {
  const parsed = command.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "VALIDATION_ERROR", message: "Choose a valid notification action." };
  const { operation, notificationId } = parsed.data;
  try {
    return await getDb().$transaction(async tx => {
      if (!actorId) throw new AccessError("UNAUTHORIZED");
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR NO KEY UPDATE`;
      const actor = await activeActor(tx, actorId);
      const where = { id: notificationId, departmentId: actor.departmentId, recipientId: actor.id };
      const notice = await tx.notification.findFirst({ where, select: { publicationId: true } });
      if (!notice || (operation === "acknowledge" && !notice.publicationId)) throw new AccessError("FORBIDDEN");
      if (operation === "acknowledge" && notice.publicationId) {
        await tx.publicationAcknowledgement.createMany({
          data: { recipientId: actor.id, publicationId: notice.publicationId },
          skipDuplicates: true,
        });
      }
      await tx.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
      return { ok: true as const, message: operation === "acknowledge" ? "Acknowledgement recorded." : "Marked as read." };
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return { ok: false as const, code: error.code, message: error.code === "UNAUTHORIZED"
        ? "Sign in with an active account and try again." : "This notification action is unavailable. Refresh your inbox." };
    }
    console.error("Notification update failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false as const, code: "ERROR", message: "Could not save the update. Try again." };
  }
}
