-- CreateEnum
CREATE TYPE "TimetableStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "SchedulingStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'HELD', 'NOT_HELD');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('FACULTY', 'SECTION', 'ROOM');

-- CreateTable
CREATE TABLE "TimetableVersion" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "status" "TimetableStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "baseScheduleRevision" INTEGER NOT NULL,
    "effectiveFrom" VARCHAR(10) NOT NULL,
    "effectiveTo" VARCHAR(10) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableEntry" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "timetableVersionId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingObligation" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "weekDate" VARCHAR(10) NOT NULL,
    "originalDate" VARCHAR(10) NOT NULL,
    "requiredMinutes" INTEGER NOT NULL,

    CONSTRAINT "TeachingObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassOccurrence" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "teachingObligationId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "localDate" VARCHAR(10) NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "schedulingStatus" "SchedulingStatus" NOT NULL DEFAULT 'ACTIVE',
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "replacesId" TEXT,

    CONSTRAINT "ClassOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceReservation" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResourceReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationReceipt" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimetableVersion_departmentId_semesterId_status_idx" ON "TimetableVersion"("departmentId", "semesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableVersion_id_departmentId_key" ON "TimetableVersion"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_timetableVersionId_seriesId_key" ON "TimetableEntry"("timetableVersionId", "seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_id_departmentId_key" ON "TimetableEntry"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingObligation_departmentId_seriesId_weekDate_key" ON "TeachingObligation"("departmentId", "seriesId", "weekDate");

-- CreateIndex
CREATE UNIQUE INDEX "TeachingObligation_id_departmentId_key" ON "TeachingObligation"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassOccurrence_replacesId_key" ON "ClassOccurrence"("replacesId");

-- CreateIndex
CREATE INDEX "ClassOccurrence_departmentId_startAt_schedulingStatus_idx" ON "ClassOccurrence"("departmentId", "startAt", "schedulingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ClassOccurrence_entryId_localDate_key" ON "ClassOccurrence"("entryId", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClassOccurrence_id_departmentId_key" ON "ClassOccurrence"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceReservation_occurrenceId_resourceType_key" ON "ResourceReservation"("occurrenceId", "resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_changeId_key" ON "Notification"("recipientId", "changeId");

-- AddForeignKey
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "TimetableVersion_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "TimetableVersion_semesterId_departmentId_fkey" FOREIGN KEY ("semesterId", "departmentId") REFERENCES "Semester"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_timetableVersionId_departmentId_fkey" FOREIGN KEY ("timetableVersionId", "departmentId") REFERENCES "TimetableVersion"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_allocationId_departmentId_fkey" FOREIGN KEY ("allocationId", "departmentId") REFERENCES "CourseAllocation"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_roomId_departmentId_fkey" FOREIGN KEY ("roomId", "departmentId") REFERENCES "Room"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingObligation" ADD CONSTRAINT "TeachingObligation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingObligation" ADD CONSTRAINT "TeachingObligation_allocationId_departmentId_fkey" FOREIGN KEY ("allocationId", "departmentId") REFERENCES "CourseAllocation"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_entryId_departmentId_fkey" FOREIGN KEY ("entryId", "departmentId") REFERENCES "TimetableEntry"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_teachingObligationId_departmentId_fkey" FOREIGN KEY ("teachingObligationId", "departmentId") REFERENCES "TeachingObligation"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_facultyId_departmentId_fkey" FOREIGN KEY ("facultyId", "departmentId") REFERENCES "Faculty"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_sectionId_departmentId_fkey" FOREIGN KEY ("sectionId", "departmentId") REFERENCES "Section"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_roomId_departmentId_fkey" FOREIGN KEY ("roomId", "departmentId") REFERENCES "Room"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceReservation" ADD CONSTRAINT "ResourceReservation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceReservation" ADD CONSTRAINT "ResourceReservation_occurrenceId_departmentId_fkey" FOREIGN KEY ("occurrenceId", "departmentId") REFERENCES "ClassOccurrence"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationReceipt" ADD CONSTRAINT "MutationReceipt_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_departmentId_fkey" FOREIGN KEY ("recipientId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Defense in depth: reservations use half-open intervals, globally per resource.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "ResourceReservation" ADD CONSTRAINT "reservation_interval" CHECK ("startAt" < "endAt");
ALTER TABLE "ResourceReservation" ADD CONSTRAINT "resource_no_overlap"
  EXCLUDE USING gist ("resourceType" WITH =, "resourceId" WITH =, tstzrange("startAt", "endAt", '[)') WITH &&);
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "entry_interval" CHECK ("weekday" BETWEEN 1 AND 5 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute");
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "version_range" CHECK ("effectiveFrom" <= "effectiveTo" AND "version" > 0 AND "baseScheduleRevision" >= 0);
ALTER TABLE "TeachingObligation" ADD CONSTRAINT "obligation_minutes" CHECK ("requiredMinutes" > 0);
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "occurrence_interval" CHECK ("startAt" < "endAt");
CREATE UNIQUE INDEX "one_active_occurrence_per_obligation" ON "ClassOccurrence" ("teachingObligationId") WHERE "schedulingStatus" = 'ACTIVE';
