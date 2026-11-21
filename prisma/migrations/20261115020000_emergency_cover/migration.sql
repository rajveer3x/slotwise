-- CreateEnum
CREATE TYPE "EmergencyRoundStatus" AS ENUM ('OPEN', 'WON', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EmergencyRound" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "EmergencyRoundStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "winnerUserId" TEXT,
    "fallback" JSONB,

    CONSTRAINT "EmergencyRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyOffer" (
    "roundId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "candidate" JSONB NOT NULL,

    CONSTRAINT "EmergencyOffer_pkey" PRIMARY KEY ("roundId","invitedUserId")
);

-- CreateIndex
CREATE INDEX "EmergencyRound_departmentId_createdById_createdAt_idx" ON "EmergencyRound"("departmentId", "createdById", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyRound_occurrenceId_status_idx" ON "EmergencyRound"("occurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyRound_id_departmentId_key" ON "EmergencyRound"("id", "departmentId");

-- CreateIndex
CREATE INDEX "EmergencyOffer_departmentId_invitedUserId_idx" ON "EmergencyOffer"("departmentId", "invitedUserId");

-- AddForeignKey
ALTER TABLE "EmergencyRound" ADD CONSTRAINT "EmergencyRound_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmergencyRound" ADD CONSTRAINT "EmergencyRound_occurrenceId_departmentId_obligationId_fkey" FOREIGN KEY ("occurrenceId", "departmentId", "obligationId") REFERENCES "ClassOccurrence"("id", "departmentId", "teachingObligationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmergencyRound" ADD CONSTRAINT "EmergencyRound_createdById_departmentId_fkey" FOREIGN KEY ("createdById", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmergencyRound" ADD CONSTRAINT "EmergencyRound_id_winnerUserId_fkey" FOREIGN KEY ("id", "winnerUserId") REFERENCES "EmergencyOffer"("roundId", "invitedUserId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmergencyOffer" ADD CONSTRAINT "EmergencyOffer_roundId_departmentId_fkey" FOREIGN KEY ("roundId", "departmentId") REFERENCES "EmergencyRound"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "EmergencyOffer" ADD CONSTRAINT "EmergencyOffer_invitedUserId_departmentId_fkey" FOREIGN KEY ("invitedUserId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Database-level backstops for claims and the scheduled-work queue.
CREATE UNIQUE INDEX "EmergencyRound_one_live_occurrence" ON "EmergencyRound" ("occurrenceId") WHERE "status" IN ('OPEN', 'WON');
CREATE INDEX "EmergencyRound_due" ON "EmergencyRound" ("deadline", "id") WHERE "status" = 'OPEN';
ALTER TABLE "EmergencyRound" ADD CONSTRAINT "EmergencyRound_lifecycle_check"
CHECK ("deadline" > "createdAt"
  AND "deadline" <= "createdAt" + INTERVAL '5 minutes'
  AND ("status" = 'OPEN') = ("closedAt" IS NULL)
  AND ("status" = 'WON') = ("winnerUserId" IS NOT NULL)
  AND ("status" = 'EXPIRED') = ("fallback" IS NOT NULL)
  AND ("status" <> 'WON' OR ("closedAt" >= "createdAt" AND "closedAt" < "deadline")));
