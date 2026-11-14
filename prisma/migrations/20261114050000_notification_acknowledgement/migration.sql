ALTER TABLE "Notification" ADD COLUMN "publicationId" TEXT;

UPDATE "Notification" AS n
SET "publicationId" = p."id"
FROM "SchedulePublication" AS p
WHERE p."id" = n."changeId" AND p."departmentId" = n."departmentId";

CREATE UNIQUE INDEX "Notification_recipientId_publicationId_key" ON "Notification"("recipientId", "publicationId");
CREATE INDEX "Notification_departmentId_recipientId_createdAt_id_idx" ON "Notification"("departmentId", "recipientId", "createdAt", "id");
CREATE INDEX "Notification_departmentId_recipientId_readAt_idx" ON "Notification"("departmentId", "recipientId", "readAt");
CREATE INDEX "Notification_publicationId_departmentId_idx" ON "Notification"("publicationId", "departmentId");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_publicationId_departmentId_fkey" FOREIGN KEY ("publicationId", "departmentId") REFERENCES "SchedulePublication"("id", "departmentId") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "Notification_publication_matches_change" CHECK ("publicationId" IS NULL OR "publicationId" = "changeId");

CREATE TABLE "PublicationAcknowledgement" (
  "recipientId" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicationAcknowledgement_pkey" PRIMARY KEY ("recipientId", "publicationId"),
  CONSTRAINT "PublicationAcknowledgement_recipientId_publicationId_fkey" FOREIGN KEY ("recipientId", "publicationId") REFERENCES "Notification"("recipientId", "publicationId") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "PublicationAcknowledgement_publicationId_idx" ON "PublicationAcknowledgement"("publicationId");
