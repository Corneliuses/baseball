-- Index the referencing side of Rsvp_recordedById_fkey, like every other FK
-- on the model — without it the constraint's ON DELETE SET NULL enforcement
-- scans the whole Rsvp table whenever a User row is deleted.

-- CreateIndex
CREATE INDEX "Rsvp_recordedById_idx" ON "Rsvp"("recordedById");
