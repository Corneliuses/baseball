-- Basketball's at-home skills: the ids of up to five solo drills from the
-- code-defined library (src/lib/skills.ts) that the coach chose for the team.
-- Baseball teams never write it.
--
-- Additive: a text array defaulting to empty, so every existing team starts
-- with no skills chosen and no backfill is needed.

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
