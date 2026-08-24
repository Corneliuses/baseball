import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
import { absoluteUrl } from "@/lib/absolute-url";
import { getCalendarToken } from "@/lib/calendar-feed";
import {
  adjacentMonth,
  bucketEventsByDay,
  buildMonthGrid,
  dayKey,
  formatEventDayLabel,
  formatEventTime,
  formatMonthLabel,
  monthParam,
  parseMonthParam,
  parseViewParam,
  WEEKDAY_LABELS,
  type CalendarMonth,
} from "@/lib/calendar";
import { messageFor } from "@/lib/error-messages";
import { mapsUrl } from "@/lib/maps";
import {
  getEvent,
  listEventsInMonthGrid,
  listPastEvents,
  listUpcomingEvents,
  type ScheduleEvent,
} from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

import { AddEventForm } from "./AddEventForm";
import { SCHEDULE_ERROR_MESSAGES } from "./schedule-messages";
import {
  scheduleContextFrom,
  scheduleQuery,
  type ScheduleContext,
} from "./schedule-context";
import { EMPTY_EVENT_VALUES, type EventFormValues } from "./event-form-state";

/// Adding an event mails every family on the roster (#45), but the coach does
/// not wait for it: `createEventAction` hands the paced fan-out to `after()`,
/// which Next runs once the response is finished. This ceiling still governs
/// that work — `after` runs for the route's configured max duration — it just
/// no longer governs anything a human is watching.
///
/// 300 rather than 60 because the cap is sized for a real roster:
/// MAX_RECIPIENTS is 200 (30 rejected a 16-player team outright, since
/// recipients dedupe per guardian rather than per household), and 200 × 600ms
/// is 120s of pacing before per-send latency. Same pair of numbers as the
/// reminder cron. **The cap and this number move together** — see the note on
/// MAX_RECIPIENTS in ./actions.ts and the loop note in AGENTS.md.
export const maxDuration = 300;

export const metadata = {
  title: "Schedule — Youth Baseball Team Manager",
};

function eventTitle(event: ScheduleEvent): string {
  if (event.type === "GAME") {
    return event.opponent ? `vs ${event.opponent}` : "Game";
  }
  return "Practice";
}

/// Calls requireTeamAccess itself, independent of the layout — every page
/// under /t/[teamId] does, since layouts don't re-run on client navigation.
export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    past?: string;
    error?: string;
    duplicate?: string;
  }>;
}) {
  const { teamId } = await params;
  const {
    view: rawView,
    month: rawMonth,
    past,
    error,
    duplicate,
  } = await searchParams;

  let role: Role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const now = new Date();
  const view = parseViewParam(rawView);
  const month = parseMonthParam(rawMonth, now);
  const showPast = past === "1";

  // Only the view actually being rendered is queried — a phone on one bar of
  // signal should not pay for the other one.
  const monthEvents =
    view === "month" ? await listEventsInMonthGrid(teamId, month) : [];
  const listEvents =
    view === "list"
      ? showPast
        ? await listPastEvents(teamId, now)
        : await listUpcomingEvents(teamId, now)
      : [];

  const canEdit = role !== "PARENT";
  const errorMessage = messageFor(SCHEDULE_ERROR_MESSAGES, error);
  const calendarToken = await getCalendarToken(teamId);
  const context = scheduleContextFrom({ view: rawView, month: rawMonth, past }, now);

  // "Duplicate event" is a link to this page, not a mutation: it loads the
  // source event and pre-fills the add form with everything but the date, and
  // the coach picks the new one. Cloning outright would put a wrongly-dated
  // event on the real schedule — pushing RSVPs and the calendar feed — until
  // someone fixed it.
  //
  // Team-scoped, so a foreign or stale event id simply renders an empty form
  // rather than leaking another team's fixture.
  const duplicateSource =
    canEdit && duplicate ? await getEvent(teamId, duplicate) : null;
  const initialValues: EventFormValues = duplicateSource
    ? {
        type: duplicateSource.type,
        // Never the date. Two events cannot share a start time, and a copied
        // one silently creating a duplicate of the original is exactly the
        // mistake this flow exists to avoid.
        startsAt: "",
        location: duplicateSource.location ?? "",
        opponent: duplicateSource.opponent ?? "",
        notes: duplicateSource.notes ?? "",
      }
    : EMPTY_EVENT_VALUES;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-xl font-semibold text-foreground">Schedule</h3>
        <div className="flex gap-2">
          <Button asChild variant={view === "month" ? "default" : "outline"} size="sm">
            <Link href={`/t/${teamId}/schedule?view=month&month=${monthParam(month)}`}>
              Month
            </Link>
          </Button>
          <Button asChild variant={view === "list" ? "default" : "outline"} size="sm">
            <Link href={`/t/${teamId}/schedule?view=list`}>List</Link>
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {view === "month" ? (
        <MonthView
          teamId={teamId}
          month={month}
          events={monthEvents}
          context={context}
        />
      ) : (
        <ListView
          teamId={teamId}
          events={listEvents}
          showPast={showPast}
          context={context}
        />
      )}

      {canEdit ? (
        <AddEventCard
          // Remounts when the coach follows a different "Duplicate" link, so
          // the freshly loaded values replace the form's own state instead of
          // being ignored by a component that already seeded itself.
          key={duplicateSource?.id ?? "new"}
          teamId={teamId}
          context={context}
          initialValues={initialValues}
          duplicatedFrom={
            duplicateSource ? eventTitle(duplicateSource) : null
          }
        />
      ) : null}

      {calendarToken ? <SeasonPassCard token={calendarToken} /> : null}
    </div>
  );
}

/// The ICS subscription (#57), printed as a **season pass**: the same ticket
/// stock as GameTicket — clay border, perforated stub end, rotated mono stub
/// text — except a game admits one and the season pass admits all. Its stub
/// is Banana Yellow: games spend clay and practices print plain, so this is
/// the schedule screen's one banana (design-plan.md §2), and the whole
/// season landing in a parent's pocket is exactly the wow it should mark.
///
/// Shown to every role — parents are the audience. The URL is a capability
/// (the token is the credential), so the copy says to keep it in the family.
/// No clipboard JS: a read-only input selects fine on a phone, and the
/// webcal link opens straight into Apple Calendar.
function SeasonPassCard({ token }: { token: string }) {
  const feedUrl = absoluteUrl(`/api/calendar/${token}`, {
    AUTH_URL: process.env.AUTH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  });
  const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");

  return (
    <Card className="overflow-hidden border-2 border-dirt/60 p-0">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
              Season pass
            </p>
            <h4 className="font-display text-lg text-foreground">
              The whole season, in your pocket
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Subscribe once and every game and practice shows up in your
              phone&apos;s calendar — schedule changes ride along on their own.
              Anyone with the link can read the schedule, so keep it in the
              family.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="calendar-feed-url"
              className="block text-sm font-medium text-foreground"
            >
              Calendar link
            </label>
            <input
              id="calendar-feed-url"
              type="text"
              readOnly
              value={feedUrl}
              className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              On an iPhone the button below opens it straight in Calendar. In
              Google Calendar: Other calendars → From URL, then paste the link.
            </p>
          </div>

          <Button asChild variant="outline" className="w-full">
            <a href={webcalUrl}>Add to my calendar</a>
          </Button>
        </div>

        {/* The stub: decorative, so it lives outside any control — and this
            screen's one banana. */}
        <div
          aria-hidden="true"
          className="flex w-16 shrink-0 items-center justify-center border-l-2 border-dashed border-dirt/60 bg-banana"
        >
          <span className="rotate-90 whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-banana-foreground">
            Admit all
          </span>
        </div>
      </div>
    </Card>
  );
}

function MonthView({
  teamId,
  month,
  events,
  context,
}: {
  teamId: string;
  month: CalendarMonth;
  events: ScheduleEvent[];
  context: ScheduleContext;
}) {
  const weeks = buildMonthGrid(month);
  const buckets = bucketEventsByDay(events);
  const previous = adjacentMonth(month, -1);
  const next = adjacentMonth(month, 1);

  // `events` covers the padded grid, so it can be non-empty purely because a
  // neighbouring month has something on a padding day. The empty state has to
  // ask about this month specifically, or it would go quiet and claim the
  // month is busy when it isn't. `dayKey` and `monthParam` are both
  // APP_TIMEZONE-anchored, so the prefix comparison is sound.
  const monthPrefix = monthParam(month);
  const hasEventsThisMonth = events.some((event) =>
    dayKey(event.startsAt).startsWith(monthPrefix),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/t/${teamId}/schedule?view=month&month=${monthParam(previous)}`}
            aria-label={`Previous month, ${formatMonthLabel(previous)}`}
          >
            ←
          </Link>
        </Button>

        <h4 className="text-base font-medium text-foreground">
          {formatMonthLabel(month)}
        </h4>

        <Button asChild variant="outline" size="sm">
          <Link
            href={`/t/${teamId}/schedule?view=month&month=${monthParam(next)}`}
            aria-label={`Next month, ${formatMonthLabel(next)}`}
          >
            →
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            {`Schedule for ${formatMonthLabel(month)}`}
          </caption>
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border border-border p-1 text-xs font-medium text-muted-foreground"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekKey}>
                {week.days.map((day) => {
                  const dayEvents = buckets.get(day.dayKey) ?? [];
                  return (
                    <td
                      key={day.dayKey}
                      className={`h-20 border border-border p-1 align-top ${
                        day.inMonth ? "" : "bg-muted/40"
                      }`}
                    >
                      <span
                        className={`block text-xs ${
                          day.inMonth ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {day.dayOfMonth}
                      </span>

                      <ul className="space-y-0.5">
                        {dayEvents.map((event) => (
                          <li key={event.id}>
                            <Link
                              href={`/t/${teamId}/schedule/${event.id}?${scheduleQuery(context)}`}
                              className={`block truncate rounded px-1 py-0.5 text-xs text-foreground hover:bg-accent ${
                                event.type === "GAME"
                                  ? "bg-primary/15"
                                  : "bg-muted"
                              }`}
                            >
                              <span className="font-medium">
                                {formatEventTime(event.startsAt)}
                              </span>{" "}
                              {eventTitle(event)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasEventsThisMonth ? null : (
        <p className="text-sm text-muted-foreground">
          Nothing scheduled in {formatMonthLabel(month)}.
        </p>
      )}
    </div>
  );
}

function ListView({
  teamId,
  events,
  showPast,
  context,
}: {
  teamId: string;
  events: ScheduleEvent[];
  showPast: boolean;
  context: ScheduleContext;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-medium text-foreground">
          {showPast ? "Past events" : "Upcoming"}
        </h4>
        <Button asChild variant="outline" size="sm">
          <Link
            href={
              showPast
                ? `/t/${teamId}/schedule?view=list`
                : `/t/${teamId}/schedule?view=list&past=1`
            }
          >
            {showPast ? "Show upcoming" : "Show past"}
          </Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="rounded-md border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
          {showPast
            ? "Nothing has happened yet. The season's still ahead."
            : "Nothing scheduled yet. The season's wide open."}
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) =>
            event.type === "GAME" ? (
              <GameTicket
                key={event.id}
                teamId={teamId}
                event={event}
                context={context}
              />
            ) : (
              <PracticeCard
                key={event.id}
                teamId={teamId}
                event={event}
                context={context}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}

/// A game prints as a ticket stub (design-plan.md §7): clay border, slab
/// opponent, and a perforated stub end. Games are the main event, so only
/// they get ticket stock — practices print plain below.
function GameTicket({
  teamId,
  event,
  context,
}: {
  teamId: string;
  event: ScheduleEvent;
  context: ScheduleContext;
}) {
  return (
    <li>
      <Card className="overflow-hidden border-2 border-dirt/60 p-0">
        <div className="flex items-stretch">
          <Link
            href={`/t/${teamId}/schedule/${event.id}?${scheduleQuery(context)}`}
            className="min-w-0 flex-1 p-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
              Game
            </p>
            <p className="truncate font-display text-lg text-foreground">
              {eventTitle(event)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatEventDayLabel(event.startsAt)} ·{" "}
              {formatEventTime(event.startsAt)}
            </p>
            {event.location ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {event.location}
              </p>
            ) : null}
          </Link>
          {/* The stub: decorative, so it lives outside the link. */}
          <div
            aria-hidden="true"
            className="flex w-16 shrink-0 items-center justify-center border-l-2 border-dashed border-dirt/60 bg-secondary"
          >
            <span className="rotate-90 whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-secondary-foreground">
              Admit one
            </span>
          </div>
        </div>
      </Card>
    </li>
  );
}

/// Practices print on plain stock — a chalk-dashed border, no stub — so the
/// list reads games-first at a glance.
function PracticeCard({
  teamId,
  event,
  context,
}: {
  teamId: string;
  event: ScheduleEvent;
  context: ScheduleContext;
}) {
  return (
    <li>
      <Card className="border-dashed shadow-none">
        <CardContent className="p-4">
          <Link
            href={`/t/${teamId}/schedule/${event.id}?${scheduleQuery(context)}`}
            className="flex flex-wrap items-baseline justify-between gap-2"
          >
            <span className="font-medium text-foreground">
              {eventTitle(event)}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatEventDayLabel(event.startsAt)} ·{" "}
              {formatEventTime(event.startsAt)}
            </span>
          </Link>
          {event.location ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {/* Unlike the game ticket, the location here sits outside the
                  event link, so it can be a map link without nesting anchors. */}
              <a
                href={mapsUrl(event.location)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-primary"
              >
                {event.location}
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

/// The card the client form sits in. Split so the heading, the description and
/// the anchor stay server-rendered — only the form itself needs to be a client
/// component, and only because it has to survive its own submit.
function AddEventCard({
  teamId,
  context,
  initialValues,
  duplicatedFrom,
}: {
  teamId: string;
  context: ScheduleContext;
  initialValues: EventFormValues;
  duplicatedFrom: string | null;
}) {
  return (
    // The anchor "Duplicate event" links to. scroll-mt keeps the card's own
    // heading clear of the top edge when the browser jumps here.
    <Card id="add-event" className="scroll-mt-4">
      <CardHeader>
        <CardTitle className="text-lg">
          {duplicatedFrom ? "Add another like it" : "Add an event"}
        </CardTitle>
        <CardDescription>
          Times are US Central. Only the type and start time are required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AddEventForm
          teamId={teamId}
          context={context}
          initialValues={initialValues}
          duplicatedFrom={duplicatedFrom}
        />
      </CardContent>
    </Card>
  );
}
