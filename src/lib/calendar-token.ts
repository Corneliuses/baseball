import { randomBytes } from "node:crypto";

/// Token generation for `Team.calendarToken` — the capability credential in
/// the ICS feed URL (/api/calendar/[token]). Calendar apps poll server-side
/// with no cookies, so the URL must carry its own auth; the token is the
/// entire check, which is why it matches the invitation token's strength.
///
/// Unlike the invitation token there is no liveness half: a calendar token
/// never expires and is never consumed. It is revoked by overwriting the
/// column (no UI for that yet — see the follow-up noted in #57).
///
/// The migration that introduced the column backfilled existing teams with
/// the same shape in SQL (gen_random_bytes(32), base64url). Keep the two in
/// step if this ever changes.

/// 32 random bytes, base64url-encoded — URL-safe with no padding, so it drops
/// straight into `/api/calendar/<token>` with no escaping.
export function generateCalendarToken(): string {
  return randomBytes(32).toString("base64url");
}
