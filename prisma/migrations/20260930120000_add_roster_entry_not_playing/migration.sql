-- "Not playing": a coach can now take a rostered kid out of the standing chart
-- entirely (injured, away for the season, not yet cleared to play). Until now
-- a kid with no batting slot and no position was a substitute, and on an
-- allPlay team was in the general outfield, so there was no way to say "this
-- kid is in neither" — the flag is the only new information.
--
-- Additive with a DEFAULT, so no backfill: every existing row is playing.
-- Invariant, enforced by the two chart saves rather than the database:
-- "notPlaying" implies "battingOrder" and "position" are both null.

-- AlterTable
ALTER TABLE "RosterEntry" ADD COLUMN "notPlaying" BOOLEAN NOT NULL DEFAULT false;
