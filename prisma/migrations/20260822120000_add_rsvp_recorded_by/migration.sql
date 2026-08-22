-- Coach-recorded absences (#54): nullable provenance column on Rsvp.
--
-- Additive and nullable, so no backfill: every existing row was written by a
-- guardian, and NULL means exactly that. SET NULL (not CASCADE) on the staff
-- user so deleting a coach's account degrades the row to family-recorded
-- instead of deleting a family's RSVP.

-- AlterTable
ALTER TABLE "Rsvp" ADD COLUMN "recordedById" TEXT;

-- AddForeignKey
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
