import Link from "next/link";
import { notFound } from "next/navigation";

import { RSVP_STYLE } from "@/components/rsvp-style";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
import { formatEventDateTime, instantToWallClock } from "@/lib/calendar";
import { messageFor, messageTable } from "@/lib/error-messages";
import { mapsUrl } from "@/lib/maps";
import { getRoster } from "@/lib/roster";
import { sortRoster } from "@/lib/roster-rules";
import { buildRsvpStateMap, staffRecordedPlayerIds } from "@/lib/rsvp";
import { guardedRosteredPlayerIds, listEventRsvps } from "@/lib/rsvps";
import { getEvent } from "@/lib/schedule";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getTeamById } from "@/lib/teams";

import { deleteEventAction, rsvpAction, updateEventAction } from "../actions";

export const metadata = {
  title: "Event — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-type": "Choose either a game or a practice.",
  "invalid-datetime": "Enter a valid date and time.",
  // The limits are named, not implied. These three were reachable purely by
  // typing — the inputs carried no maxLength — so a coach could be told "too
  // long" with no idea by how much (#51). Both halves are fixed: the fields
  // now stop at the same numbers the action enforces, and the sentence says
  // what the number is for anything that still gets through (a paste, a
  // forged POST).
  "invalid-location": "Location is too long — keep it under 200 characters.",
  "invalid-opponent": "Opponent is too long — keep it under 200 characters.",
  "invalid-notes": "Notes are too long — keep them under 2,000 characters.",
  "invalid-rsvp": "Choose a valid response.",
  "not-your-player": "You can only RSVP for your own kids.",
  "not-on-team": "That player is not on this team's roster.",
  access: "You no longer have access to make this change.",
});

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

  const [team, rosterEntries, rsvpRows, guardedPlayerIds] = await Promise.all([
    getTeamById(teamId),
    getRoster(teamId),
    listEventRsvps(teamId, eventId),
    guardedRosteredPlayerIds(teamId, userId),
  ]);
  if (!team) {
    notFound();
  }
  // Same order as the roster page — getRoster has no orderBy, so without this
  // the same team lists in a different (and unstable) order on each page.
  const roster = sortRoster(rosterEntries);
  const rsvpStateByPlayerId = buildRsvpStateMap(
    roster.map((entry) => entry.player.id),
    rsvpRows,
  );
  // Which current responses a staff member recorded (#54) — the note that
  // keeps a family from wondering how their kid got marked out.
  const staffRecorded = staffRecordedPlayerIds(rsvpRows);

  const canEdit = role !== "PARENT";
  // Archived teams reject every write server-side; hiding the buttons rather
  // than showing-and-refusing matches team home (its `teamIsWritable`).
  const teamIsWritable = team.archivedAt === null;
  const errorMessage = messageFor(ERROR_MESSAGES, error);
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
                // Guardians answer for their own kids; staff (COACH+) may
                // answer for any rostered player (#54). The action re-checks
                // both — these flags only decide what to render.
                const canRsvp =
                  teamIsWritable &&
                  (guardedPlayerIds.has(entry.player.id) || canEdit);

                return (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {entry.player.name}
                      </p>
                      <p className={`text-xs ${badge.tagClassName}`}>
                        {badge.label}
                        {staffRecorded.has(entry.player.id) ? (
                          // Text, never colour alone — same rule as the badge
                          // itself (rsvp-style.ts).
                          <span className="text-muted-foreground">
                            {" "}
                            · Recorded by coach
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {canRsvp ? (
                      <div className="flex shrink-0 gap-2">
                        <form action={rsvpAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="playerId" value={entry.player.id} />
                          <input type="hidden" name="response" value="attending" />
                          {/* A coach's list renders these controls on every
                              row, so each needs the player's name in its
                              accessible name — same argument as team home's
                              rsvpLabel; here one event is on screen, so the
                              name alone disambiguates. */}
                          <SubmitButton
                            size="sm"
                            pendingLabel="Saving…"
                            variant={state === "attending" ? "default" : "outline"}
                            aria-label={`${entry.player.name} is going`}
                          >
                            Going
                          </SubmitButton>
                        </form>
                        <form action={rsvpAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="playerId" value={entry.player.id} />
                          <input type="hidden" name="response" value="declined" />
                          <SubmitButton
                            size="sm"
                            pendingLabel="Saving…"
                            variant={state === "declined" ? "destructive" : "outline"}
                            aria-label={`${entry.player.name} is not going`}
                          >
                            Not going
                          </SubmitButton>
                        </form>
                        {canEdit && state !== "no-response" ? (
                          // Staff-only: back to "No response" when the coach
                          // recorded something the family didn't mean, or is
                          // undoing their own entry. No row → nothing to clear.
                          <form action={rsvpAction}>
                            <input type="hidden" name="teamId" value={teamId} />
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="playerId"
                              value={entry.player.id}
                            />
                            <input type="hidden" name="response" value="clear" />
                            <SubmitButton
                              size="sm"
                              variant="ghost"
                              pendingLabel="Clearing…"
                              aria-label={`Clear ${entry.player.name}'s response`}
                            >
                              Clear
                            </SubmitButton>
                          </form>
                        ) : null}
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
              maxLength={200}
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
              maxLength={200}
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
              maxLength={2000}
                    rows={2}
                    defaultValue={event.notes ?? ""}
                    className={inputClass}
                  />
                </div>

                <SubmitButton className="w-full" pendingLabel="Saving…">
                  Save changes
                </SubmitButton>
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
                      <SubmitButton variant="destructive" pendingLabel="Deleting…">
                        Yes, delete it
                      </SubmitButton>
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
