-- Owner-set GroupMe invite link, shown to members on team home.
--
-- Additive and nullable, no backfill: null simply means the team has no
-- GroupMe chat (or the owner hasn't shared it yet), and the page renders
-- nothing for it.

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "groupMeUrl" TEXT;
