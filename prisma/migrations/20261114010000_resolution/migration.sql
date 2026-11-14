CREATE TABLE "ResolutionPlan" (
  "id" TEXT PRIMARY KEY, "departmentId" TEXT NOT NULL, "leaveRequestId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1,
  "baseScheduleRevision" INTEGER NOT NULL, "revisionSnapshot" JSONB NOT NULL, "policySnapshot" JSONB NOT NULL,
  "snapshotToken" TEXT NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "resolution_draft_only" CHECK ("status" = 'DRAFT' AND "version" > 0 AND "baseScheduleRevision" >= 0),
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("leaveRequestId", "departmentId") REFERENCES "LeaveRequest"("id", "departmentId") ON DELETE RESTRICT,
  FOREIGN KEY ("ownerId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "ResolutionPlan_leaveRequestId_ownerId_key" ON "ResolutionPlan"("leaveRequestId", "ownerId");
CREATE UNIQUE INDEX "ResolutionPlan_id_departmentId_key" ON "ResolutionPlan"("id", "departmentId");
CREATE TABLE "ResolutionItem" (
  "id" TEXT PRIMARY KEY, "departmentId" TEXT NOT NULL, "planId" TEXT NOT NULL, "occurrenceId" TEXT NOT NULL,
  "selectedCandidateId" TEXT, "rejectedCandidates" JSONB NOT NULL, "explanation" JSONB NOT NULL,
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("planId", "departmentId") REFERENCES "ResolutionPlan"("id", "departmentId") ON DELETE RESTRICT,
  FOREIGN KEY ("occurrenceId", "departmentId") REFERENCES "ClassOccurrence"("id", "departmentId") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "ResolutionItem_planId_occurrenceId_key" ON "ResolutionItem"("planId", "occurrenceId");
