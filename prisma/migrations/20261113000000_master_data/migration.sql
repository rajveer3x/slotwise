-- CreateEnum
CREATE TYPE "TeachingType" AS ENUM ('THEORY', 'LAB');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "onlineTeachingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "scheduleRevision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "semesterId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faculty" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "targetMinutesPerWeek" INTEGER NOT NULL,
    "maxMinutesPerDay" INTEGER NOT NULL,
    "maxMinutesPerWeek" INTEGER NOT NULL,

    CONSTRAINT "Faculty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyAvailability" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "facultyId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "FacultyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TeachingType" NOT NULL,
    "requiredContactMinutes" INTEGER NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyQualification" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "facultyId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "FacultyQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "semesterId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "preferredPeriodsPerDay" INTEGER NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionMembership" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isRepresentative" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SectionMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TeachingType" NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAllocation" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "courseId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "weeklyPeriods" INTEGER NOT NULL,
    "requiredContactMinutes" INTEGER NOT NULL,

    CONSTRAINT "CourseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterMutationReceipt" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "MasterMutationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Semester_departmentId_archived_idx" ON "Semester"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_departmentId_code_key" ON "Semester"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_id_departmentId_key" ON "Semester"("id", "departmentId");

-- CreateIndex
CREATE INDEX "Holiday_departmentId_archived_idx" ON "Holiday"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_departmentId_semesterId_date_key" ON "Holiday"("departmentId", "semesterId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_id_departmentId_key" ON "Holiday"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_userId_key" ON "Faculty"("userId");

-- CreateIndex
CREATE INDEX "Faculty_departmentId_archived_idx" ON "Faculty"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_userId_departmentId_key" ON "Faculty"("userId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Faculty_id_departmentId_key" ON "Faculty"("id", "departmentId");

-- CreateIndex
CREATE INDEX "FacultyAvailability_departmentId_archived_idx" ON "FacultyAvailability"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyAvailability_departmentId_facultyId_weekday_startMin_key" ON "FacultyAvailability"("departmentId", "facultyId", "weekday", "startMinute", "endMinute");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyAvailability_id_departmentId_key" ON "FacultyAvailability"("id", "departmentId");

-- CreateIndex
CREATE INDEX "Course_departmentId_archived_idx" ON "Course"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Course_departmentId_code_key" ON "Course"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Course_id_departmentId_key" ON "Course"("id", "departmentId");

-- CreateIndex
CREATE INDEX "FacultyQualification_departmentId_archived_idx" ON "FacultyQualification"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyQualification_departmentId_facultyId_courseId_key" ON "FacultyQualification"("departmentId", "facultyId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyQualification_id_departmentId_key" ON "FacultyQualification"("id", "departmentId");

-- CreateIndex
CREATE INDEX "Section_departmentId_archived_idx" ON "Section"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Section_departmentId_semesterId_code_key" ON "Section"("departmentId", "semesterId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Section_id_departmentId_key" ON "Section"("id", "departmentId");

-- CreateIndex
CREATE INDEX "SectionMembership_departmentId_archived_idx" ON "SectionMembership"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "SectionMembership_departmentId_sectionId_userId_key" ON "SectionMembership"("departmentId", "sectionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionMembership_id_departmentId_key" ON "SectionMembership"("id", "departmentId");

-- CreateIndex
CREATE INDEX "Room_departmentId_archived_idx" ON "Room"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "Room_departmentId_code_key" ON "Room"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Room_id_departmentId_key" ON "Room"("id", "departmentId");

-- CreateIndex
CREATE INDEX "TimeSlot_departmentId_archived_idx" ON "TimeSlot"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_departmentId_weekday_startMinute_endMinute_key" ON "TimeSlot"("departmentId", "weekday", "startMinute", "endMinute");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_id_departmentId_key" ON "TimeSlot"("id", "departmentId");

-- CreateIndex
CREATE INDEX "CourseAllocation_departmentId_archived_idx" ON "CourseAllocation"("departmentId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAllocation_departmentId_semesterId_sectionId_courseId_key" ON "CourseAllocation"("departmentId", "semesterId", "sectionId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAllocation_id_departmentId_key" ON "CourseAllocation"("id", "departmentId");

-- CreateIndex
CREATE INDEX "MasterMutationReceipt_departmentId_idx" ON "MasterMutationReceipt"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_departmentId_key" ON "User"("id", "departmentId");

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_semesterId_departmentId_fkey" FOREIGN KEY ("semesterId", "departmentId") REFERENCES "Semester"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_userId_departmentId_fkey" FOREIGN KEY ("userId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyAvailability" ADD CONSTRAINT "FacultyAvailability_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyAvailability" ADD CONSTRAINT "FacultyAvailability_facultyId_departmentId_fkey" FOREIGN KEY ("facultyId", "departmentId") REFERENCES "Faculty"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyQualification" ADD CONSTRAINT "FacultyQualification_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyQualification" ADD CONSTRAINT "FacultyQualification_facultyId_departmentId_fkey" FOREIGN KEY ("facultyId", "departmentId") REFERENCES "Faculty"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyQualification" ADD CONSTRAINT "FacultyQualification_courseId_departmentId_fkey" FOREIGN KEY ("courseId", "departmentId") REFERENCES "Course"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_semesterId_departmentId_fkey" FOREIGN KEY ("semesterId", "departmentId") REFERENCES "Semester"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionMembership" ADD CONSTRAINT "SectionMembership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionMembership" ADD CONSTRAINT "SectionMembership_sectionId_departmentId_fkey" FOREIGN KEY ("sectionId", "departmentId") REFERENCES "Section"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionMembership" ADD CONSTRAINT "SectionMembership_userId_departmentId_fkey" FOREIGN KEY ("userId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAllocation" ADD CONSTRAINT "CourseAllocation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAllocation" ADD CONSTRAINT "CourseAllocation_courseId_departmentId_fkey" FOREIGN KEY ("courseId", "departmentId") REFERENCES "Course"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAllocation" ADD CONSTRAINT "CourseAllocation_facultyId_departmentId_fkey" FOREIGN KEY ("facultyId", "departmentId") REFERENCES "Faculty"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAllocation" ADD CONSTRAINT "CourseAllocation_sectionId_departmentId_fkey" FOREIGN KEY ("sectionId", "departmentId") REFERENCES "Section"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAllocation" ADD CONSTRAINT "CourseAllocation_semesterId_departmentId_fkey" FOREIGN KEY ("semesterId", "departmentId") REFERENCES "Semester"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterMutationReceipt" ADD CONSTRAINT "MasterMutationReceipt_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Dates are institution-local calendar dates, never UTC instants. The cast
-- checks actual calendar validity as well as the canonical YYYY-MM-DD shape.
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_dates_check" CHECK (
  "startDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "endDate" ~ '^\d{4}-\d{2}-\d{2}$'
  AND "startDate"::date <= "endDate"::date AND "scheduleRevision" >= 0);
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_date_check" CHECK ("date" ~ '^\d{4}-\d{2}-\d{2}$' AND "date"::date IS NOT NULL);
CREATE UNIQUE INDEX "Semester_one_active_per_department" ON "Semester" ("departmentId") WHERE "active" AND NOT "archived";
ALTER TABLE "Faculty" ADD CONSTRAINT "Faculty_limits_check" CHECK (
  "targetMinutesPerWeek" > 0 AND "maxMinutesPerDay" > 0 AND "maxMinutesPerDay" <= 1440
  AND "maxMinutesPerWeek" >= "maxMinutesPerDay" AND "maxMinutesPerWeek" >= "targetMinutesPerWeek" AND "maxMinutesPerWeek" <= 10080);
ALTER TABLE "Course" ADD CONSTRAINT "Course_minutes_check" CHECK ("requiredContactMinutes" > 0);
ALTER TABLE "Section" ADD CONSTRAINT "Section_counts_check" CHECK ("strength" > 0 AND "preferredPeriodsPerDay" BETWEEN 1 AND 24);
ALTER TABLE "Room" ADD CONSTRAINT "Room_capacity_check" CHECK ("capacity" > 0);
ALTER TABLE "CourseAllocation" ADD CONSTRAINT "Allocation_counts_check" CHECK ("weeklyPeriods" BETWEEN 1 AND 60 AND "requiredContactMinutes" > 0);
ALTER TABLE "FacultyAvailability" ADD CONSTRAINT "Availability_interval_check" CHECK ("weekday" BETWEEN 1 AND 6 AND "startMinute" >= 0 AND "endMinute" < 1440 AND "startMinute" < "endMinute");
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_interval_check" CHECK ("weekday" BETWEEN 1 AND 6 AND "startMinute" >= 0 AND "endMinute" < 1440 AND "startMinute" < "endMinute");
