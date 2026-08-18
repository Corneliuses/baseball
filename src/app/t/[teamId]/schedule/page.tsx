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
import {
  listEventsInMonthGrid,
  listPastEvents,
  listUpcomingEvents,
  type ScheduleEvent,
} from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

import { createEventAction } from "./actions";

export const metadata = {
  title: "Schedule — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-type": "Choose either a game or a practice.",
  "invalid-datetime": "Enter a valid date and time.",
  "invalid-location": "Location is too long.",
  "invalid-opponent": "Opponent is too long.",
  "invalid-notes": "Notes are too long.",
  access: "You no longer have access to make this change.",
};

const TYPE_LABELS = { GAME: "Game", PRACTICE: "Practice" } as const;

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

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
    added?: string;
  }>;
}) {
  const { teamId } = await params;
  const { view: rawView, month: rawMonth, past, error, added } = await searchParams;

  let role;
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
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

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

      {added && !errorMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          Event added.
        </p>
      ) : null}

      {view === "month" ? (
        <MonthView teamId={teamId} month={month} events={monthEvents} />
      ) : (
        <ListView
          teamId={teamId}
          events={listEvents}
          showPast={showPast}
        />
      )}

      {canEdit ? <AddEventForm teamId={teamId} /> : null}
    </div>
  );
}

function MonthView({
  teamId,
  month,
  events,
}: {
  teamId: string;
  month: CalendarMonth;
  events: ScheduleEvent[];
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
                              href={`/t/${teamId}/schedule/${event.id}`}
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
}: {
  teamId: string;
  events: ScheduleEvent[];
  showPast: boolean;
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
              <GameTicket key={event.id} teamId={teamId} event={event} />
            ) : (
              <PracticeCard key={event.id} teamId={teamId} event={event} />
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
}: {
  teamId: string;
  event: ScheduleEvent;
}) {
  return (
    <li>
      <Card className="overflow-hidden border-2 border-dirt/60 p-0">
        <div className="flex items-stretch">
          <Link
            href={`/t/${teamId}/schedule/${event.id}`}
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
}: {
  teamId: string;
  event: ScheduleEvent;
}) {
  return (
    <li>
      <Card className="border-dashed shadow-none">
        <CardContent className="p-4">
          <Link
            href={`/t/${teamId}/schedule/${event.id}`}
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
            <p className="mt-1 text-sm text-muted-foreground">{event.location}</p>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

function AddEventForm({ teamId }: { teamId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Add an event</CardTitle>
        <CardDescription>
          Times are US Central. Only the type and start time are required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createEventAction} className="space-y-4">
          <input type="hidden" name="teamId" value={teamId} />

          <div className="space-y-2">
            <label htmlFor="type" className="block text-sm font-medium text-foreground">
              Type
            </label>
            <select id="type" name="type" required defaultValue="GAME" className={inputClass}>
              <option value="GAME">{TYPE_LABELS.GAME}</option>
              <option value="PRACTICE">{TYPE_LABELS.PRACTICE}</option>
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="startsAt"
              className="block text-sm font-medium text-foreground"
            >
              Starts at
            </label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="location"
              className="block text-sm font-medium text-foreground"
            >
              Location (optional)
            </label>
            <input id="location" name="location" type="text" className={inputClass} />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="opponent"
              className="block text-sm font-medium text-foreground"
            >
              Opponent (optional)
            </label>
            <input id="opponent" name="opponent" type="text" className={inputClass} />
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="block text-sm font-medium text-foreground">
              Notes (optional)
            </label>
            <textarea id="notes" name="notes" rows={2} className={inputClass} />
          </div>

          <Button type="submit" className="w-full">
            Add event
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
