-- Every team now has a sport, so the app can coach basketball teams beside
-- baseball ones. Lineup-chart surfaces are gated on it (hasLineupChart in
-- src/lib/sport.ts); basketball has no chart yet.
--
-- Additive with a DEFAULT, so no backfill: every existing team is baseball.

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('BASEBALL', 'BASKETBALL');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "sport" "Sport" NOT NULL DEFAULT 'BASEBALL';
