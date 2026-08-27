-- Named outfield spots on allPlay teams: up to three kids can now share
-- LF/CF/RF, so the one-row-per-(team, position) index has to widen. The new
-- "positionSlot" column joins the key purely as a uniqueness mechanism —
-- infield writes always use slot 0 (keeping "one kid per infield position"
-- database-enforced exactly as before), and savePositions numbers outfield
-- slots 0..2 per position on every save. The up-to-three cap itself lives in
-- validatePositions (chart.ts).
--
-- Additive with a DEFAULT, so no backfill: every existing row holds at most
-- one entry per position and lands on slot 0, which is exactly what the next
-- save would write for it.

-- AlterTable
ALTER TABLE "RosterEntry" ADD COLUMN "positionSlot" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "RosterEntry_teamId_position_key";

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_teamId_position_positionSlot_key" ON "RosterEntry"("teamId", "position", "positionSlot");
