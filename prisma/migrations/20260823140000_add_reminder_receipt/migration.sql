-- Day-of reminder ledger (#47): one row per reminder actually dispatched for
-- one (event, guardian) pair.
--
-- Purely additive — a new table, no existing column touched, so no backfill.
-- An empty table means "nothing has been reminded yet", which is exactly true
-- of every event that existed before this migration.
--
-- The unique index on ("eventId", "userId") is the duplicate protection
-- itself, not a query optimisation: the cron claims a row before sending and
-- deletes it again if the send fails, so two overlapping invocations race at
-- Postgres rather than in application code.
--
-- Statements below are Prisma's own DDL for the model, taken verbatim from
-- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma
-- --script` (hand-written because creating migrations needs a live Postgres
-- URL — see AGENTS.md).

-- CreateTable
CREATE TABLE "ReminderReceipt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderReceipt_userId_idx" ON "ReminderReceipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderReceipt_eventId_userId_key" ON "ReminderReceipt"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "ReminderReceipt" ADD CONSTRAINT "ReminderReceipt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderReceipt" ADD CONSTRAINT "ReminderReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
