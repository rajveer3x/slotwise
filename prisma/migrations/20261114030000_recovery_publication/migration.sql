ALTER TABLE "ResolutionPlan" DROP CONSTRAINT "resolution_draft_only";
ALTER TABLE "ResolutionPlan" ADD CONSTRAINT "resolution_plan_state" CHECK ("status" IN ('DRAFT','READY','PUBLISHED','SUPERSEDED') AND "version" > 0 AND "baseScheduleRevision" >= 0);
CREATE TABLE "SchedulePublication" (
  "id" TEXT PRIMARY KEY, "departmentId" TEXT NOT NULL, "planId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL, "previewFingerprint" TEXT NOT NULL, "details" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  FOREIGN KEY ("planId", "departmentId") REFERENCES "ResolutionPlan"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "SchedulePublication_id_departmentId_key" ON "SchedulePublication"("id", "departmentId");
CREATE INDEX "SchedulePublication_departmentId_createdAt_idx" ON "SchedulePublication"("departmentId", "createdAt");
ALTER TABLE "ResolutionItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT', ADD COLUMN "publicationId" TEXT;
ALTER TABLE "ResolutionItem" ADD CONSTRAINT "resolution_item_state" CHECK (("status" = 'PUBLISHED' AND "publicationId" IS NOT NULL AND "selectedCandidateId" IS NOT NULL) OR ("status" IN ('DRAFT','SUPERSEDED') AND "publicationId" IS NULL));
ALTER TABLE "ResolutionItem" ADD FOREIGN KEY ("publicationId", "departmentId") REFERENCES "SchedulePublication"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "ClassOccurrence" ALTER COLUMN "roomId" DROP NOT NULL;
ALTER TABLE "ClassOccurrence" ADD COLUMN "meetingUrl" TEXT, ADD COLUMN "resolutionTier" INTEGER, ADD COLUMN "publicationId" TEXT;
ALTER TABLE "ClassOccurrence" ADD FOREIGN KEY ("publicationId", "departmentId") REFERENCES "SchedulePublication"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "occurrence_recovery_mode" CHECK (
 ("resolutionTier" IS NULL AND "roomId" IS NOT NULL AND "meetingUrl" IS NULL AND "publicationId" IS NULL) OR
 ("resolutionTier" IS NOT NULL AND "resolutionTier" BETWEEN 1 AND 5 AND "publicationId" IS NOT NULL AND "resolved" AND
   (("resolutionTier" = 4 AND "roomId" IS NULL AND "meetingUrl" ~ '^https://[^/[:space:]]+') OR
    ("resolutionTier" <> 4 AND "roomId" IS NOT NULL AND "meetingUrl" IS NULL)))
);
-- Retain cancelled originals, including a substitute at exactly the original entry/date.
DROP INDEX "ClassOccurrence_entryId_localDate_key";
CREATE INDEX "ClassOccurrence_entryId_localDate_idx" ON "ClassOccurrence"("entryId", "localDate");
CREATE UNIQUE INDEX "occurrence_active_entry_date" ON "ClassOccurrence"("entryId", "localDate") WHERE "schedulingStatus" = 'ACTIVE';
