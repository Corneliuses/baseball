import { db } from "./db";
import type { ScheduleEvent } from "./schedule";

/// Data layer for the ICS feed (/api/calendar/[token]) — the one surface a
/// signed-out caller can read team data through, which is why what it selects
/// is so narrow. The capability token IS the authorization: resolving it
/// against the unique column is the entire check, so there is no
/// requireTeamAccess here and deliberately no archivedAt filter — an archived
/// team's feed keeps serving read-only, exactly like its schedule page.
///
/// Database errors are NOT swallowed, and the stakes are higher than the
/// schedule.ts precedent: this feed is a sync source. An outage caught and
/// rendered as an empty calendar would be dutifully mirrored by every
/// subscriber's calendar app — deleting the whole season client-side. A 500
/// leaves their last good copy alone.
///
/// Minors'-data posture (#57): event data only. No roster, no names, no RSVP
/// states, no user columns — the select lists below are the enforcement, and
/// calendar-feed.test.ts pins them.

export type FeedTeam = {
  id: string;
  name: string;
  season: string | null;
};

/// `null` means "no team holds this token" — unknown or since rotated. The
/// route turns it into a plain 404.
export async function getTeamByCalendarToken(
  token: string,
): Promise<FeedTeam | null> {
  return db.team.findUnique({
    where: { calendarToken: token },
    select: { id: true, name: true, season: true },
  });
}

/// The signed-in half: the schedule page reads the token back (after
/// requireTeamAccess, like every page under /t/[teamId]) to surface the
/// subscribe URL. `null` only for a team id that doesn't exist — the column
/// is non-null, backfilled by its migration.
export async function getCalendarToken(teamId: string): Promise<string | null> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { calendarToken: true },
  });

  return team?.calendarToken ?? null;
}

/// The whole schedule, past and future — a subscription shows the season, not
/// a window, and calendar apps drop VEVENTs that leave the feed (so filtering
/// here would erase history from subscribers' calendars). `teamId` in the
/// where clause like every schedule.ts query.
export async function listAllEvents(teamId: string): Promise<ScheduleEvent[]> {
  return db.event.findMany({
    where: { teamId },
    select: {
      id: true,
      type: true,
      startsAt: true,
      location: true,
      opponent: true,
      notes: true,
    },
    orderBy: { startsAt: "asc" },
  });
}
