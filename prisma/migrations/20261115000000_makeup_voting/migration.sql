-- CreateEnum
CREATE TYPE "MakeupPollStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "MakeupPoll" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "MakeupPollStatus" NOT NULL DEFAULT 'OPEN',
    "baseScheduleRevision" INTEGER NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MakeupPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeupPollOption" (
    "pollId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "candidateId" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "facultyName" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,

    CONSTRAINT "MakeupPollOption_pkey" PRIMARY KEY ("pollId","position")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "pollId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "voterId" TEXT NOT NULL,
    "votedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("pollId")
);

-- CreateIndex
CREATE INDEX "MakeupPoll_departmentId_createdAt_id_idx" ON "MakeupPoll"("departmentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MakeupPoll_obligationId_createdAt_id_idx" ON "MakeupPoll"("obligationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MakeupPoll_id_departmentId_key" ON "MakeupPoll"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MakeupPollOption_pollId_candidateId_key" ON "MakeupPollOption"("pollId", "candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_departmentId_key" ON "PollVote"("pollId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassOccurrence_makeup_scope_key" ON "ClassOccurrence"("id", "departmentId", "teachingObligationId");

-- AddForeignKey
ALTER TABLE "MakeupPoll" ADD CONSTRAINT "MakeupPoll_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MakeupPoll" ADD CONSTRAINT "MakeupPoll_occurrenceId_departmentId_obligationId_fkey" FOREIGN KEY ("occurrenceId", "departmentId", "obligationId") REFERENCES "ClassOccurrence"("id", "departmentId", "teachingObligationId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MakeupPoll" ADD CONSTRAINT "MakeupPoll_createdById_departmentId_fkey" FOREIGN KEY ("createdById", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MakeupPollOption" ADD CONSTRAINT "MakeupPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "MakeupPoll"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_departmentId_fkey" FOREIGN KEY ("pollId", "departmentId") REFERENCES "MakeupPoll"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_position_fkey" FOREIGN KEY ("pollId", "position") REFERENCES "MakeupPollOption"("pollId", "position") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_voterId_departmentId_fkey" FOREIGN KEY ("voterId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Only one open poll can exist for an obligation, even across recovery sources.
CREATE UNIQUE INDEX "MakeupPoll_one_open_per_obligation" ON "MakeupPoll" ("obligationId") WHERE "status" = 'OPEN';
ALTER TABLE "MakeupPoll" ADD CONSTRAINT "MakeupPoll_deadline_check" CHECK ("deadline" > "createdAt");
ALTER TABLE "MakeupPollOption" ADD CONSTRAINT "MakeupPollOption_interval_check" CHECK ("position" BETWEEN 1 AND 3 AND "startAt" < "endAt");
