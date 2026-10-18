-- Auth.js is gone (B4): sign-in runs through the auth service, and nothing in
-- the app reads or writes either table any more. This is the separate, later
-- migration 20261017000000_auth_service_columns promised.
--
-- Destructive and not reversible:
-- * "Account" held Auth.js provider links. The email-code provider never wrote
--   rows here, and the auth service's identity is "User"."authSub" now.
-- * "VerificationToken" held hashed, short-lived Auth.js sign-in codes. Any
--   still in it can no longer be redeemed, because the route that redeemed
--   them was deleted with Auth.js.
--
-- "Session" and the authjs.session-token cookie name stay: every session row
-- minted before the cutover keeps working until it expires.

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "VerificationToken";
