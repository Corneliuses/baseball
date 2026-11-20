-- Basketball's playbook: the ids of up to five plays from the code-defined
-- library (src/lib/plays.ts) that the coach chose for the team. Baseball
-- teams never write it.
--
-- Additive: a text array defaulting to empty, so every existing team starts
-- with an empty playbook and no backfill is needed.

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "playbook" TEXT[] DEFAULT ARRAY[]::TEXT[];
