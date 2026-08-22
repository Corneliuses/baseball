import { getTeamByCalendarToken, listAllEvents } from "@/lib/calendar-feed";
import { buildTeamCalendar } from "@/lib/ics";

/// The ICS feed (#57) needs a real HTTP endpoint — calendar apps GET it on
/// their own schedule, with no cookies and no session — which is why this is
/// a Route Handler (the magic-link callback precedent), and why it lives
/// under /api/ rather than /t/[teamId]/: proxy.ts matches /t/:path* and
/// would redirect every cookie-less fetch to /signin. The capability token
/// in the path is the entire credential; it also names the team, so the URL
/// carries no teamId.
///
/// An unknown token 404s with no body — no redirect, no hint of whether a
/// team exists. A database error propagates to a 500 on purpose: see
/// calendar-feed.ts for why an empty 200 would be worse.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const team = await getTeamByCalendarToken(token);
  if (!team) {
    return new Response(null, { status: 404 });
  }

  const events = await listAllEvents(team.id);
  const ics = buildTeamCalendar(team, events, new Date());

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Polling-friendly, but stale by at most an hour so edits meet the
      // next poll; `private` keeps shared caches away from a capability URL.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
