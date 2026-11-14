-- CreateEnum
CREATE TYPE "CoverStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SubstitutionRequest" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "candidateFingerprint" TEXT NOT NULL,
    "candidate" JSONB NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "CoverStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closureReason" TEXT,

    CONSTRAINT "SubstitutionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaturdayException" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewerId" TEXT,
    "candidateFingerprint" TEXT NOT NULL,
    "candidate" JSONB NOT NULL,
    "earlierTiers" JSONB NOT NULL,
    "requestReason" TEXT NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closureReason" TEXT,

    CONSTRAINT "SaturdayException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubstitutionRequest_departmentId_invitedUserId_status_idx" ON "SubstitutionRequest"("departmentId", "invitedUserId", "status");

-- CreateIndex
CREATE INDEX "SubstitutionRequest_itemId_idx" ON "SubstitutionRequest"("itemId");

-- CreateIndex
CREATE INDEX "SubstitutionRequest_obligationId_status_idx" ON "SubstitutionRequest"("obligationId", "status");

-- CreateIndex
CREATE INDEX "SaturdayException_departmentId_status_idx" ON "SaturdayException"("departmentId", "status");

-- CreateIndex
CREATE INDEX "SaturdayException_itemId_idx" ON "SaturdayException"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionItem_id_departmentId_key" ON "ResolutionItem"("id", "departmentId");

-- AddForeignKey
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "SubstitutionRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "SubstitutionRequest_itemId_departmentId_fkey" FOREIGN KEY ("itemId", "departmentId") REFERENCES "ResolutionItem"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "SubstitutionRequest_obligationId_departmentId_fkey" FOREIGN KEY ("obligationId", "departmentId") REFERENCES "TeachingObligation"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "SubstitutionRequest_invitedUserId_departmentId_fkey" FOREIGN KEY ("invitedUserId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "SubstitutionRequest_requestedById_departmentId_fkey" FOREIGN KEY ("requestedById", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SaturdayException" ADD CONSTRAINT "SaturdayException_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SaturdayException" ADD CONSTRAINT "SaturdayException_itemId_departmentId_fkey" FOREIGN KEY ("itemId", "departmentId") REFERENCES "ResolutionItem"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SaturdayException" ADD CONSTRAINT "SaturdayException_requestedById_departmentId_fkey" FOREIGN KEY ("requestedById", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SaturdayException" ADD CONSTRAINT "SaturdayException_reviewerId_departmentId_fkey" FOREIGN KEY ("reviewerId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- Responses are consent only; one accepted cover per retained teaching obligation.
CREATE UNIQUE INDEX "cover_one_accepted_obligation" ON "SubstitutionRequest" ("obligationId") WHERE "status" = 'ACCEPTED';
CREATE UNIQUE INDEX "cover_one_open_item" ON "SubstitutionRequest" ("itemId") WHERE "status" IN ('PENDING', 'ACCEPTED');
CREATE UNIQUE INDEX "exception_one_open_item" ON "SaturdayException" ("itemId") WHERE "status" IN ('PENDING', 'APPROVED');
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "cover_times" CHECK ("endAt" > "startAt" AND "expiresAt" > "createdAt" AND "expiresAt" <= "startAt");
ALTER TABLE "SubstitutionRequest" ADD CONSTRAINT "cover_state" CHECK (
  ("status" NOT IN ('ACCEPTED', 'DECLINED') OR "respondedAt" IS NOT NULL) AND
  ("status" = 'PENDING' OR "closedAt" IS NOT NULL) AND length("candidateFingerprint") = 64
);
ALTER TABLE "SaturdayException" ADD CONSTRAINT "exception_decision" CHECK (
  ("status" NOT IN ('APPROVED', 'REJECTED') OR ("reviewerId" IS NOT NULL AND "decidedAt" IS NOT NULL AND length(trim("decisionReason")) > 0 AND "reviewerId" <> "requestedById")) AND
  length(trim("requestReason")) > 0 AND length("candidateFingerprint") = 64
);
