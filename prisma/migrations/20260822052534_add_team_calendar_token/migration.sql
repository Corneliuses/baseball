-- Per-team capability token for the ICS calendar feed (#57).
--
-- Backfilled here rather than generated lazily: lazy generation is a write,
-- and archived teams reject every write — a rule this feature must not carve
-- an exception into. New teams get their token from generateCalendarToken()
-- in createTeam; this backfill mirrors it (32 random bytes, base64url — the
-- translate() drops the '=' padding because its third argument is shorter).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "calendarToken" TEXT;

UPDATE "Team" SET "calendarToken" = translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

ALTER TABLE "Team" ALTER COLUMN "calendarToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Team_calendarToken_key" ON "Team"("calendarToken");
