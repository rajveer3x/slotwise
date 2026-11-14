-- A recovery can share its originating template entry/date with another week's
-- obligation at a different time. Resource intervals and obligation identity,
-- rather than the template date, protect published recovery uniqueness.
DROP INDEX "occurrence_active_entry_date";
CREATE UNIQUE INDEX "template_active_entry_date" ON "ClassOccurrence"("entryId", "localDate") WHERE "schedulingStatus" = 'ACTIVE' AND "publicationId" IS NULL;
