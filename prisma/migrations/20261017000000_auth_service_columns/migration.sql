-- The auth service (auth.corneliuses.com) takes over proving who someone is.
-- Two nullable columns, so this is additive and needs no backfill: the Auth.js
-- code still running when this applies never reads or writes either.
--
-- "User"."authSub" is the service's subject identifier, set at a person's
-- first service login. Unique, because it is the lookup key from then on;
-- Postgres allows any number of NULLs under a unique index, so every existing
-- row is fine.
--
-- "Session"."idToken" is the id token from the login that created the row,
-- kept only as the id_token_hint for sign-out.
--
-- Account and VerificationToken stay until the Auth.js code is gone; dropping
-- them is a separate, later migration (build runs migrate deploy while the old
-- deployment is still serving).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "authSub" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "idToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_authSub_key" ON "User"("authSub");
