-- Basketball's lineup: on a basketball team each roster entry either starts
-- at one of the five court positions or sits on the bench, in an order the
-- coach sets (1 = first off the bench). Nothing on a baseball team writes
-- either column, and nothing on a basketball team writes the baseball chart
-- columns.
--
-- Additive: a nullable enum column and a nullable INTEGER, so no backfill —
-- every existing row starts nowhere and has no bench slot.

-- CreateEnum
CREATE TYPE "CourtPosition" AS ENUM ('POINT_GUARD', 'SHOOTING_GUARD', 'SMALL_FORWARD', 'POWER_FORWARD', 'CENTER');

-- AlterTable
ALTER TABLE "RosterEntry" ADD COLUMN     "benchOrder" INTEGER,
ADD COLUMN     "courtPosition" "CourtPosition";

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_teamId_courtPosition_key" ON "RosterEntry"("teamId", "courtPosition");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_teamId_benchOrder_key" ON "RosterEntry"("teamId", "benchOrder");
