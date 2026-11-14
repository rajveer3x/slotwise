CREATE TYPE "CalendarScope" AS ENUM ('FACULTY', 'SECTION');

CREATE TABLE "CalendarSubscription" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "scope" "CalendarScope" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "tokenHash" CHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "CalendarSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CalendarSubscription_ownerId_departmentId_fkey"
        FOREIGN KEY ("ownerId", "departmentId") REFERENCES "User"("id", "departmentId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CalendarSubscription_tokenHash_key" ON "CalendarSubscription"("tokenHash");
CREATE UNIQUE INDEX "CalendarSubscription_ownerId_scope_scopeId_key" ON "CalendarSubscription"("ownerId", "scope", "scopeId");

ALTER TABLE "ClassOccurrence" ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);
-- Give pre-existing cancellations one retention window from migration.
UPDATE "ClassOccurrence" SET "cancelledAt" = statement_timestamp() WHERE "schedulingStatus" = 'CANCELLED';

CREATE FUNCTION track_occurrence_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."schedulingStatus" = 'ACTIVE' THEN
        NEW."cancelledAt" := NULL;
    ELSIF TG_OP = 'INSERT' OR OLD."schedulingStatus" <> 'CANCELLED' THEN
        NEW."cancelledAt" := statement_timestamp();
    ELSE
        NEW."cancelledAt" := OLD."cancelledAt";
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER track_occurrence_cancellation
BEFORE INSERT OR UPDATE OF "schedulingStatus" ON "ClassOccurrence"
FOR EACH ROW EXECUTE FUNCTION track_occurrence_cancellation();
