import Link from "next/link";
import { notFound } from "next/navigation";

import { InstallPrompt } from "@/components/InstallPrompt";
import { RSVP_STYLE } from "@/components/rsvp-style";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
import { formatEventDateTime } from "@/lib/calendar";
import { chartRole } from "@/lib/chart-role";
import {
  byJerseyThenName,
  hasChartSet,
  type ChartViewEntry,
} from "@/lib/chart-view";
import { sortDirectory } from "@/lib/directory-rules";
import { mapsUrl } from "@/lib/maps";
import { listCoachContacts } from "@/lib/memberships";
import { getChart } from "@/lib/roster";
import { buildRsvpStateMapsByEvent } from "@/lib/rsvp";
import { guardedRosteredPlayerIds, listRsvpsForEvents } from "@/lib/rsvps";
import { nextEvents, type ScheduleEvent } from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { rsvpAction } from "./schedule/actions";

/// Copy for the codes `rsvpAction` redirects here with when it is posted from
/// this page (`from=home`). Deliberately the event page's wording for the
/// three codes both pages share — a parent who taps Going from either place is
/// owed the same sentence — plus `event-gone`, which only this page can
/// produce: from the event page a deleted event bounces to the schedule, where
/// its absence explains itself.
///
/// Null prototype, matching /profile: the key comes straight from the ?error=
/// query param, and on a plain object ?error=constructor would resolve an
/// Object.prototype member — truthy, so the fallback never fires — into a
/// non-renderable React child that crashes the page.
const ERROR_MESSAGES: Record<string, string> = Object.assign(Object.create(null), {
  "invalid-rsvp": "Choose a valid response.",
  "not-your-player": "You can only RSVP for your own kids.",
  "event-gone": "That event was just taken off the schedule.",
  access: "You no longer have access to make this change.",
});

/// How many events the page shows, each answerable. Three covers the week a
/// parent is actually planning without turning team home into the schedule —
/// which is still one tap away, and is where the rest of the season lives.
const UPCOMING_LIMIT = 3;

function eventHeading(event: ScheduleEvent): string {
  if (event.type !== "GAME") return "Practice";
  return event.opponent ? `Game vs ${event.opponent}` : "Game";
}

/// Calls requireTeamAccess independently of the layout above it — see the
/// comment on layout.tsx. This page's own check is currently redundant with
/// the layout's (same intent, no minRole), but the rule every page under
/// /t/[teamId] follows is "check for yourself," not "trust the layout ran."
///
/// The parent dashboard (#48). The three questions the brief says this app
/// exists to answer — when, where, is my kid playing — are answered here, on
/// the page the invitation email lands everyone on, rather than two taps away
/// behind the schedule.
///
/// Laid out so all three are answered in one screenful: the chart line first
/// because it is one line per kid and never changes between events, then the
/// upcoming events, each carrying its own RSVP buttons. Grouping the buttons
/// under the event rather than under the child is what keeps three events from
/// printing every event's name and date once per kid.
///
/// What renders is keyed on **guardianship, not role**: a coach who is also a
/// parent RSVPs their own kid from here exactly as they can from the event
/// page, and a member guarding nobody on this team simply gets no buttons and
/// no summary. The event cards are informational and show for everyone.
export default async function TeamHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { teamId } = await params;
  const { error, saved } = await searchParams;

  let role: Role;
  let userId: string;
  try {
    ({ role, userId } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const team = await getTeamById(teamId);
  if (!team) {
    notFound();
  }

  // Deliberately NOT wrapped in try/catch — `nextEvents`' contract is that a
  // database outage propagates rather than rendering the same "nothing on the
  // schedule" empty state a team between seasons would show. Same argument for
  // getChart below. A parent standing at a field being told there is no
  // practice is the failure this page exists to prevent.
  //
  // One clock for the whole render: `nextEvents` applies the grace window
  // against it, and the per-event RSVP gate below measures the same events
  // against the same instant. Two `new Date()` calls could straddle a start.
  const now = new Date();
  const [upcoming, guardedPlayerIds] = await Promise.all([
    nextEvents(teamId, UPCOMING_LIMIT, now),
    guardedRosteredPlayerIds(teamId, userId),
  ]);

  // Only the viewer's own kids: `guardedRosteredPlayerIds` intersects global
  // guardianship with *this* team's roster, so nothing here is another
  // family's data. No guarded kids means neither query runs at all.
  //
  // One read across all three events rather than one per card: asking the same
  // question three times over separately fetched rows is how two cards end up
  // disagreeing about the same family.
  const [chartEntries, rsvpRows] = guardedPlayerIds.size
    ? await Promise.all([
        getChart(teamId),
        listRsvpsForEvents(
          teamId,
          upcoming.map((event) => event.id),
        ),
      ])
    : [[] as ChartViewEntry[], []];

  // Sorted, not left in the order `getChart` handed over: that is a findMany
  // with no orderBy, so a parent with two kids would see them swap places
  // between requests. Jersey then name is the roster's order everywhere else.
  const myKids = chartEntries
    .filter((entry) => guardedPlayerIds.has(entry.playerId))
    .sort(byJerseyThenName);
  const rsvpStatesByEvent = buildRsvpStateMapsByEvent(
    upcoming.map((event) => event.id),
    myKids.map((entry) => entry.playerId),
    rsvpRows,
  );

  // Whether this team has a chart at all, asked across the whole roster rather
  // than this parent's kids — "no chart set yet" is a fact about the team, and
  // it is what /view says for the same data. Without it every line below
  // asserts a definite spot nobody assigned: OF for every kid on an allPlay
  // team, Bench on a selective one.
  const hasChart = hasChartSet(chartEntries);

  // Archived teams reject every write regardless of role, so the buttons are
  // hidden rather than shown and refused — AC 4. The summaries and any answer
  // already given stay: last season is still worth reading. `rsvpAction`
  // remains the real boundary for the load-then-archive race, and its refusal
  // lands back here with the copy above.
  const teamIsWritable = team.archivedAt === null;

  // The start time is the other gate, and it is asked per event. `nextEvents`
  // keeps returning one for GAME_GRACE_MS after it begins — right, for a card
  // whose job is "you are standing at this one" — but these buttons make that
  // same id the target of a *write*. On a doubleheader morning, "Not going" at
  // 11am would otherwise decline the 9am game already played. Attendance at an
  // event that has started is a fact, not a plan.
  //
  // Now that every upcoming event carries its own buttons this is the
  // doubleheader actually solved rather than merely made safe: the game in
  // progress loses its buttons while the noon game keeps them, so the parent
  // answers for the right one without leaving the page.
  const answerable = (event: ScheduleEvent) =>
    teamIsWritable && event.startsAt.getTime() > now.getTime();

  // Parents only: the coaching staff's contact card. /directory is
  // coach-and-above, and its recorded escape hatch — "a parent who needs to
  // reach someone goes through the coach" — needs the coach to be reachable
  // in-app. listCoachContacts selects OWNER and COACH rows only, so nothing
  // here is another family's data. Coaches and the owner get the full
  // directory instead, so the card would be redundant for them.
  const coachContacts =
    role === "PARENT" ? sortDirectory(await listCoachContacts(teamId)) : [];

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm">
        {team.season && (
          <p className="text-muted-foreground">Season: {team.season}</p>
        )}
        <p className="text-muted-foreground">
          {team.allPlay ? "All players bat and field" : "Selective lineup"}
        </p>
        {team.archivedAt && (
          <p className="font-medium text-destructive">
            This team is archived and read-only.
          </p>
        )}
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {saved && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saved.
        </p>
      ) : null}

      {/* Is my kid playing. One line each, above the events, so a parent with
          one kid gets all three answers without scrolling. */}
      {myKids.length > 0 ? (
        <ul className="space-y-1">
          {myKids.map((entry) => (
            <li key={entry.entryId} className="text-sm">
              <span className="font-medium text-foreground">{entry.playerName}</span>
              {entry.jerseyNumber !== null ? (
                <span className="text-muted-foreground"> · #{entry.jerseyNumber}</span>
              ) : null}
              <span className="text-muted-foreground">
                {" · "}
                {hasChart
                  ? chartRole(entry, team.allPlay, { benchLabel: "Bench" })
                  : "No chart set yet"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* When and where, and the answer, for each of the next few. Games *and*
          practices, unlike readiness (#12): that page checks a chart, and a
          practice has none, but a parent still has to drive to one. */}
      {upcoming.length > 0 ? (
        <ul className="space-y-4">
          {upcoming.map((event) => {
            const states = rsvpStatesByEvent.get(event.id);
            const canAnswer = answerable(event);

            return (
              <li key={event.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{eventHeading(event)}</CardTitle>
                    <CardDescription>
                      {formatEventDateTime(event.startsAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {event.location ? (
                      <p className="text-foreground">
                        {/* The location a parent has to drive to is a link,
                            same as the coach's phone number — see the event
                            page. */}
                        <a
                          href={mapsUrl(event.location)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-primary"
                        >
                          {event.location}
                        </a>
                      </p>
                    ) : (
                      <p className="text-muted-foreground">No location set.</p>
                    )}
                    {event.notes ? (
                      <p className="whitespace-pre-line text-muted-foreground">
                        {event.notes}
                      </p>
                    ) : null}

                    {myKids.length > 0 ? (
                      <ul className="space-y-2">
                        {myKids.map((entry) => {
                          const state = states?.get(entry.playerId) ?? "no-response";
                          // `no-response` is styled distinct from `declined` —
                          // it means the family hasn't answered, not that they
                          // said no. See rsvp.ts.
                          const badge = RSVP_STYLE[state];

                          return (
                            <li
                              key={entry.entryId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                            >
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {entry.playerName}
                                </p>
                                <p className={`text-xs ${badge.tagClassName}`}>
                                  {badge.label}
                                </p>
                              </div>
                              {canAnswer ? (
                                <div className="flex shrink-0 gap-2">
                                  <form action={rsvpAction}>
                                    <input
                                      type="hidden"
                                      name="teamId"
                                      value={teamId}
                                    />
                                    <input
                                      type="hidden"
                                      name="eventId"
                                      value={event.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="playerId"
                                      value={entry.playerId}
                                    />
                                    <input
                                      type="hidden"
                                      name="response"
                                      value="attending"
                                    />
                                    {/* Sends the action's redirect back here
                                        rather than to the event page — the
                                        whole point of one-tap. An enum, never
                                        a URL; see actions.ts. */}
                                    <input type="hidden" name="from" value="home" />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant={
                                        state === "attending" ? "default" : "outline"
                                      }
                                      aria-label={`${entry.playerName} is going to ${eventHeading(event)}`}
                                    >
                                      Going
                                    </Button>
                                  </form>
                                  <form action={rsvpAction}>
                                    <input
                                      type="hidden"
                                      name="teamId"
                                      value={teamId}
                                    />
                                    <input
                                      type="hidden"
                                      name="eventId"
                                      value={event.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="playerId"
                                      value={entry.playerId}
                                    />
                                    <input
                                      type="hidden"
                                      name="response"
                                      value="declined"
                                    />
                                    <input type="hidden" name="from" value="home" />
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant={
                                        state === "declined" ? "destructive" : "outline"
                                      }
                                      aria-label={`${entry.playerName} is not going to ${eventHeading(event)}`}
                                    >
                                      Not going
                                    </Button>
                                  </form>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    <Button asChild variant="outline" size="sm">
                      <Link href={`/t/${teamId}/schedule/${event.id}`}>
                        Event details
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nothing scheduled yet</CardTitle>
            <CardDescription>
              The next game or practice shows up here as soon as it&rsquo;s on the
              schedule.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Navigation used to live here as a wall of outline buttons; it is now
          the persistent TeamNav in the /t/[teamId] layout, on every team view.
          Role-gated links (directory, settings) are gated there — and, as
          always, enforced by each page itself. */}

      {coachContacts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Coaches</h3>
          <ul className="space-y-2">
            {coachContacts.map((coach) => (
              <li key={coach.userId}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {coach.name ?? coach.email}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        · {coach.role === "OWNER" ? "Owner" : "Coach"}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>
                      <a
                        href={`mailto:${coach.email}`}
                        className="text-foreground underline"
                      >
                        {coach.email}
                      </a>
                    </p>
                    <p className="text-muted-foreground">
                      {coach.phone ? (
                        <a href={`tel:${coach.phone}`} className="underline">
                          {coach.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last on the page, and on team home rather than in a layout. This is
          where the invitation email lands everyone and where parents come back
          to, so the offer is made once somewhere they already visit instead of
          following them onto every screen — and it sits below the coaching
          staff's contact card, which is the thing a parent actually came for.
          It renders nothing when the app is already installed, when it has been
          dismissed, or when the browser cannot install at all. */}
      <InstallPrompt />
    </div>
  );
}
