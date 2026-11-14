-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "ClassOccurrence" ADD COLUMN     "leaveRequestId" TEXT;

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "privateReason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'SUBMITTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveRequest_departmentId_facultyId_startDate_endDate_idx" ON "LeaveRequest"("departmentId", "facultyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_departmentId_status_createdAt_idx" ON "LeaveRequest"("departmentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_id_departmentId_key" ON "LeaveRequest"("id", "departmentId");

-- AddForeignKey
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "ClassOccurrence_leaveRequestId_departmentId_fkey" FOREIGN KEY ("leaveRequestId", "departmentId") REFERENCES "LeaveRequest"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_facultyId_departmentId_fkey" FOREIGN KEY ("facultyId", "departmentId") REFERENCES "Faculty"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_semesterId_departmentId_fkey" FOREIGN KEY ("semesterId", "departmentId") REFERENCES "Semester"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewerId_departmentId_fkey" FOREIGN KEY ("reviewerId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "LeaveRequest" ADD CONSTRAINT "leave_dates_valid" CHECK (
  "startDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "endDate" ~ '^\d{4}-\d{2}-\d{2}$'
  AND to_char("startDate"::date, 'YYYY-MM-DD') = "startDate"
  AND to_char("endDate"::date, 'YYYY-MM-DD') = "endDate"
  AND "startDate" <= "endDate"
);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "leave_version_positive" CHECK (version > 0);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "leave_decision_valid" CHECK (
  (status = 'SUBMITTED' AND "reviewerId" IS NULL AND "decidedAt" IS NULL AND "rejectionReason" IS NULL)
  OR (status = 'WITHDRAWN' AND "reviewerId" IS NULL AND "decidedAt" IS NOT NULL AND "rejectionReason" IS NULL)
  OR (status = 'APPROVED' AND "reviewerId" IS NOT NULL AND "decidedAt" IS NOT NULL AND "rejectionReason" IS NULL)
  OR (status = 'REJECTED' AND "reviewerId" IS NOT NULL AND "decidedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL AND length(trim("rejectionReason")) > 0)
);
-- Defence in depth for concurrent submissions, including different semesters.
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "leave_no_overlap" EXCLUDE USING gist (
  "facultyId" WITH =,
  daterange(
    make_date(substring("startDate", 1, 4)::int, substring("startDate", 6, 2)::int, substring("startDate", 9, 2)::int),
    make_date(substring("endDate", 1, 4)::int, substring("endDate", 6, 2)::int, substring("endDate", 9, 2)::int), '[]') WITH &&
) WHERE (status IN ('SUBMITTED', 'APPROVED'));
