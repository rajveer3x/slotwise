-- PostgreSQL CHECK accepts UNKNOWN, so explicitly reject NULL online links.
ALTER TABLE "ClassOccurrence" DROP CONSTRAINT "occurrence_recovery_mode";
ALTER TABLE "ClassOccurrence" ADD CONSTRAINT "occurrence_recovery_mode" CHECK (
 ("resolutionTier" IS NULL AND "roomId" IS NOT NULL AND "meetingUrl" IS NULL AND "publicationId" IS NULL) OR
 ("resolutionTier" IS NOT NULL AND "resolutionTier" BETWEEN 1 AND 5 AND "publicationId" IS NOT NULL AND "resolved" AND
   (("resolutionTier" = 4 AND "roomId" IS NULL AND "meetingUrl" IS NOT NULL AND "meetingUrl" ~ '^https://[^/[:space:]]+') OR
    ("resolutionTier" <> 4 AND "roomId" IS NOT NULL AND "meetingUrl" IS NULL)))
);
