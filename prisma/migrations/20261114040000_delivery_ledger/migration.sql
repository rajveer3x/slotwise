-- AlterTable
ALTER TABLE "ResolutionPlan" ADD COLUMN     "sourceOccurrenceId" TEXT,
ALTER COLUMN "leaveRequestId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DeliveryRecord" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "confirmedMinutes" INTEGER NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "reason" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeliveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryRecord_departmentId_obligationId_idx" ON "DeliveryRecord"("departmentId", "obligationId");

-- CreateIndex
CREATE INDEX "DeliveryRecord_occurrenceId_createdAt_idx" ON "DeliveryRecord"("occurrenceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionPlan_sourceOccurrenceId_ownerId_key" ON "ResolutionPlan"("sourceOccurrenceId", "ownerId");

-- AddForeignKey
ALTER TABLE "ResolutionPlan" ADD CONSTRAINT "ResolutionPlan_sourceOccurrenceId_departmentId_fkey" FOREIGN KEY ("sourceOccurrenceId", "departmentId") REFERENCES "ClassOccurrence"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_obligationId_departmentId_fkey" FOREIGN KEY ("obligationId", "departmentId") REFERENCES "TeachingObligation"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_occurrenceId_departmentId_fkey" FOREIGN KEY ("occurrenceId", "departmentId") REFERENCES "ClassOccurrence"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_confirmedById_departmentId_fkey" FOREIGN KEY ("confirmedById", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Independent database protection against concurrent or bypassed double credit.
CREATE UNIQUE INDEX "delivery_current_occurrence" ON "DeliveryRecord" ("occurrenceId") WHERE "current";
CREATE UNIQUE INDEX "delivery_unique_credit" ON "DeliveryRecord" ("obligationId") WHERE "current" AND "status" = 'HELD';
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "delivery_state" CHECK (
  (("status" = 'HELD' AND "confirmedMinutes" > 0) OR ("status" = 'NOT_HELD' AND "confirmedMinutes" = 0))
  AND ("current" = ("supersededAt" IS NULL))
  AND ("reason" IS NULL OR length(trim("reason")) BETWEEN 1 AND 1000)
);
ALTER TABLE "ResolutionPlan" ADD CONSTRAINT "resolution_source" CHECK (num_nonnulls("leaveRequestId", "sourceOccurrenceId") = 1);
CREATE FUNCTION check_delivery_obligation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ClassOccurrence" o JOIN "TeachingObligation" t ON t.id = o."teachingObligationId"
    WHERE o.id = NEW."occurrenceId" AND t.id = NEW."obligationId" AND o."departmentId" = NEW."departmentId"
      AND (NEW.status <> 'HELD' OR (NEW."confirmedMinutes" = t."requiredMinutes"
        AND NEW."confirmedMinutes" * interval '1 minute' = o."endAt" - o."startAt"))
  ) THEN RAISE EXCEPTION 'Invalid delivery obligation or duration' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER delivery_obligation BEFORE INSERT OR UPDATE ON "DeliveryRecord" FOR EACH ROW EXECUTE FUNCTION check_delivery_obligation();
