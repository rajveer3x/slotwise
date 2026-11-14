ALTER TABLE "Notification" ADD COLUMN "affectedObligationIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
