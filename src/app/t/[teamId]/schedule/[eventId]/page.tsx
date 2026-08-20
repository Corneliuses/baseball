import Link from "next/link";
import { notFound } from "next/navigation";

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
import { formatEventDateTime, instantToWallClock } from "@/lib/calendar";
import { mapsUrl } from "@/lib/maps";
import { getRoster } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";
import { buildRsvpStateMap } from "@/lib/rsvp";
import { guardedRosteredPlayerIds, listEventRsvps } from "@/lib/rsvps";
import { getEvent } from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";

import { deleteEventAction, rsvpAction, updateEventAction } from "../actions";

export const metadata = {
  title: "Event — Youth Baseball Team Manager",
};

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-type": "Choose either a game or a practice.",
  "invalid-datetime": "Enter a valid date and time.",
  "invalid-location": "Location is too long.",
  "invalid-opponent": "Opponent is too long.",
  "invalid-notes": "Notes are too long.",
  "invalid-rsvp": "Choose a valid response.",
  "not-your-player": "You can only RSVP for your own kids.",
  access: "You no longer have access to make this change.",
};

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/// Every member reads. Editing and deletion require COACH+, enforced both by
/// hiding the controls here and by requireTeamAccess inside each action — this
/// page's own check is "read" so a parent can land here from the schedule,
/// matching the roster-entry and settings pages.
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; eventId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; confirm?: string }>;
}) {
  const { teamId, eventId } = await params;
  const { error, saved, confirm } = await searchParams;

  let role: Role;
  let userId;
  try {
    ({ role, userId } = await requireTeamAccess(teamId, { intent: "read" }));
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const event = await getEvent(teamId, eventId);
  if (!event) {
    notFound();
  }

  const [rosterEntries, rsvpRows, guardedPlayerIds] = await Promise.all([
    getRoster(teamId),
    listEventRsvps(teamId, eventId),
    guardedRosteredPlayerIds(teamId, userId),
  ]);
  // Same order as the roster page — getRoster has no orderBy, so without this
  // the same team lists in a different (and unstable) order on each page.
  const roster = sortRoster(rosterEntries);
  const rsvpStateByPlayerId = buildRsvpStateMap(
    roster.map((entry) => entry.player.id),
    rsvpRows,
  );

  const canEdit = role !== "PARENT";
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;
  const confirmingDelete = confirm === "delete";
  const heading =
    event.type === "GAME"
      ? event.opponent
        ? `Game vs ${event.opponent}`
        : "Game"
      : "Practice";

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <Button asChild variant="outline" size="sm">
        <Link href={`/t/${teamId}/schedule`}>← Schedule</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
          <CardDescription>{formatEventDateTime(event.startsAt)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {event.location ? (
            <p className="text-foreground">
              {/* Coach email and phone are already mailto:/tel: links; the
                  location a parent has to drive to deserves the same. */}
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
            <p className="whitespace-pre-line text-muted-foreground">{event.notes}</p>
          ) : null}
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Attendance</CardTitle>
          <CardDescription>
            RSVP is just for planning — every kid stays on the roster and in the chart
            either way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players on the roster yet.</p>
          ) : (
            <ul className="space-y-2">
              {roster.map((entry) => {
                const state = rsvpStateByPlayerId.get(entry.player.id) ?? "no-response";
                // `no-response` is styled distinct from `declined` — it means
                // the family hasn't answered, not that they said no. See rsvp.ts.
                const badge = RSVP_STYLE[state];
                const canRsvp = guardedPlayerIds.has(entry.player.id);

                return (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {entry.player.name}
                      </p>
                      <p className={`text-xs ${badge.tagClassName}`}>{badge.label}</p>
                    </div>
                    {canRsvp ? (
                      <div className="flex shrink-0 gap-2">
                        <form action={rsvpAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="playerId" value={entry.player.id} />
                          <input type="hidden" name="response" value="attending" />
                          <Button
                            type="submit"
                            size="sm"
                            variant={state === "attending" ? "default" : "outline"}
                          >
                            Going
                          </Button>
                        </form>
                        <form action={rsvpAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="playerId" value={entry.player.id} />
                          <input type="hidden" name="response" value="declined" />
                          <Button
                            type="submit"
                            size="sm"
                            variant={state === "declined" ? "destructive" : "outline"}
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
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Edit event</CardTitle>
              <CardDescription>Times are US Central.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={updateEventAction} className="space-y-4">
                <input type="hidden" name="teamId" value={teamId} />
                <input type="hidden" name="eventId" value={event.id} />

                <div className="space-y-2">
                  <label
                    htmlFor="type"
                    className="block text-sm font-medium text-foreground"
                  >
                    Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    required
                    defaultValue={event.type}
                    className={inputClass}
                  >
                    <option value="GAME">Game</option>
                    <option value="PRACTICE">Practice</option>
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
                    defaultValue={instantToWallClock(event.startsAt)}
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
                  <input
                    id="location"
                    name="location"
                    type="text"
                    defaultValue={event.location ?? ""}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="opponent"
                    className="block text-sm font-medium text-foreground"
                  >
                    Opponent (optional)
                  </label>
                  <input
                    id="opponent"
                    name="opponent"
                    type="text"
                    defaultValue={event.opponent ?? ""}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-foreground"
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    defaultValue={event.notes ?? ""}
                    className={inputClass}
                  />
                </div>

                <Button type="submit" className="w-full">
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Delete this event</CardTitle>
              <CardDescription>
                Deleting an event also deletes every RSVP for it. This cannot be
                undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {confirmingDelete ? (
                <div className="space-y-3">
                  <p role="alert" className="text-sm text-destructive">
                    Permanently delete this event and its RSVPs?
                  </p>
                  <div className="flex gap-2">
                    <form action={deleteEventAction}>
                      <input type="hidden" name="teamId" value={teamId} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <Button type="submit" variant="destructive">
                        Yes, delete it
                      </Button>
                    </form>
                    <Button asChild variant="outline">
                      <Link href={`/t/${teamId}/schedule/${event.id}`}>Cancel</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <Button asChild variant="destructive">
                  <Link href={`/t/${teamId}/schedule/${event.id}?confirm=delete`}>
                    Delete event
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
