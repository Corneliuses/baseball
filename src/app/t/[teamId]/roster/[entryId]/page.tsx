import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messageFor, messageTable } from "@/lib/error-messages";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getRosterEntry, type RosterEntryGuardian } from "@/lib/roster";

import {
  linkGuardianAction,
  removeRosterEntryAction,
  resendInvitationAction,
  setGuardianPhoneAction,
  unlinkGuardianAction,
  updateRosterEntryAction,
} from "../actions";

export const metadata = {
  title: "Player — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-name": "Player name is required.",
  "invalid-dob": "Enter a valid date, or leave it blank.",
  "invalid-jersey": "Jersey number must be a whole number between 0 and 99.",
  "jersey-taken": "That jersey number is already in use on this team.",
  "invalid-email": "Enter a valid email address.",
  "invalid-phone": "Phone number must be 32 characters or fewer.",
  "email-failed": "The invitation could not be sent. Try again.",
  "not-a-guardian": "That person is not a guardian of this player.",
  access: "You no longer have access to make this change.",
});

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/// A guardian holds their Membership from the moment they are linked, so
/// membership alone never means "onboarded" — only a completed sign-in does.
/// See RosterEntryGuardian in src/lib/roster.ts.
function guardianStatus(guardian: RosterEntryGuardian): string {
  if (!guardian.isMember) {
    return "No access to this team";
  }
  return guardian.hasSignedIn ? "Signed in" : "Invitation pending";
}

/// Coach-and-above, like /directory: this page is the roster admin surface —
/// jersey and DOB edits plus every linked guardian's name, email, and phone —
/// and the roster list has never rendered its link to parents. Gating the
/// whole route (rather than hiding the guardian card in JSX) makes the
/// boundary structural: guardian contact details are only ever fetched for a
/// caller already proven COACH+, so no future edit to this page's markup can
/// leak them to a parent. Each mutating action re-checks COACH+ with write
/// intent for itself.
export default async function RosterEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; entryId: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    invited?: string;
    confirm?: string;
    guardian?: string;
  }>;
}) {
  const { teamId, entryId } = await params;
  const { error, saved, invited, confirm, guardian } = await searchParams;

  try {
    await requireTeamAccess(teamId, { intent: "read", minRole: "COACH" });
  } catch (caught) {
    if (caught instanceof TeamAccessError) {
      notFound();
    }
    throw caught;
  }

  const entry = await getRosterEntry(teamId, entryId);
  if (!entry) {
    notFound();
  }

  const errorMessage = messageFor(ERROR_MESSAGES, error);
  const confirmingRemoval = confirm === "remove";
  // Unlinking confirms per guardian: ?confirm=unlink&guardian=<id> shows the
  // step on that row only, so the other rows keep their one-tap buttons.
  const unlinkingGuardianId = confirm === "unlink" ? (guardian ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{entry.player.name}</CardTitle>
          <CardDescription>
            {entry.jerseyNumber !== null ? `#${entry.jerseyNumber}` : "No jersey number yet"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={updateRosterEntryAction} className="space-y-4">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="entryId" value={entryId} />

            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={entry.player.name}
                aria-describedby={errorMessage ? "entry-error" : undefined}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-foreground">
                Date of birth (optional)
              </label>
              <input
                id="dateOfBirth"
                name="dateOfBirth"
                type="date"
                defaultValue={toDateInputValue(entry.player.dateOfBirth)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="jerseyNumber" className="block text-sm font-medium text-foreground">
                Jersey number (optional)
              </label>
              <input
                id="jerseyNumber"
                name="jerseyNumber"
                type="number"
                min={0}
                max={99}
                defaultValue={entry.jerseyNumber ?? ""}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {errorMessage ? (
              <p id="entry-error" role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            {saved && !errorMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                Saved.
              </p>
            ) : null}

            <SubmitButton className="w-full" pendingLabel="Saving…">
              Save changes
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Guardians</CardTitle>
          <CardDescription>
            Guardians linked here get access to this team as parents, and are mailed an
            invitation the first time they&apos;re linked to anyone on this team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invited && !errorMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              Invitation sent.
            </p>
          ) : null}

          {entry.guardians.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guardians linked yet.</p>
          ) : (
            <ul className="space-y-2">
              {entry.guardians.map((guardian) => (
                <li
                  key={guardian.id}
                  className="space-y-3 rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {guardian.name ?? guardian.email}
                      </p>
                      <p className="text-sm text-muted-foreground">{guardian.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {guardianStatus(guardian)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {!guardian.hasSignedIn ? (
                        <form action={resendInvitationAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="entryId" value={entryId} />
                          <input type="hidden" name="userId" value={guardian.id} />
                          <SubmitButton
                            variant="outline"
                            size="sm"
                            pendingLabel="Sending…"
                          >
                            Resend
                          </SubmitButton>
                        </form>
                      ) : null}
                      {unlinkingGuardianId !== guardian.id ? (
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={`/t/${teamId}/roster/${entryId}?confirm=unlink&guardian=${guardian.id}`}
                          >
                            Unlink
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {unlinkingGuardianId === guardian.id ? (
                    <div className="space-y-3 border-t border-border pt-3">
                      <p role="alert" className="text-sm text-destructive">
                        Unlink {guardian.name ?? guardian.email} from{" "}
                        {entry.player.name}? They keep their team access, but
                        can no longer RSVP for this player.
                      </p>
                      <div className="flex gap-2">
                        <form action={unlinkGuardianAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="entryId" value={entryId} />
                          <input type="hidden" name="userId" value={guardian.id} />
                          <SubmitButton
                            variant="destructive"
                            size="sm"
                            pendingLabel="Unlinking…"
                          >
                            Yes, unlink
                          </SubmitButton>
                        </form>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/t/${teamId}/roster/${entryId}`}>
                            Cancel
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <form
                    action={setGuardianPhoneAction}
                    className="flex items-end gap-2 border-t border-border pt-3"
                  >
                    <input type="hidden" name="teamId" value={teamId} />
                    <input type="hidden" name="entryId" value={entryId} />
                    <input type="hidden" name="userId" value={guardian.id} />
                    <div className="flex-1 space-y-1">
                      <label
                        htmlFor={`phone-${guardian.id}`}
                        className="block text-xs font-medium text-foreground"
                      >
                        Phone
                      </label>
                      <input
                        id={`phone-${guardian.id}`}
                        name="phone"
                        type="tel"
                        defaultValue={guardian.phone ?? ""}
                        placeholder="(555) 123-4567"
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <SubmitButton
                      variant="outline"
                      size="sm"
                      pendingLabel="Saving…"
                    >
                      Save phone
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action={linkGuardianAction} className="space-y-2 border-t border-border pt-4">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="entryId" value={entryId} />

            <label htmlFor="guardianEmail" className="block text-sm font-medium text-foreground">
              Add a guardian by email
            </label>
            <div className="flex gap-2">
              <input
                id="guardianEmail"
                name="email"
                type="email"
                required
                placeholder="parent@example.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <SubmitButton variant="outline" pendingLabel="Adding…">
                Add
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Remove from roster</CardTitle>
          <CardDescription>
            Removes this player&apos;s spot on this team only. The player and their
            guardians are not deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Confirms like event deletion — removal also drops the entry's
              jersey number, batting slot, and position, none of which can be
              recovered by re-adding the player. */}
          {confirmingRemoval ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                Remove {entry.player.name} from this roster? Their jersey
                number, batting slot, and position on this team go with them.
              </p>
              <div className="flex gap-2">
                <form action={removeRosterEntryAction}>
                  <input type="hidden" name="teamId" value={teamId} />
                  <input type="hidden" name="entryId" value={entryId} />
                  <SubmitButton variant="destructive" pendingLabel="Removing…">
                    Yes, remove them
                  </SubmitButton>
                </form>
                <Button asChild variant="outline">
                  <Link href={`/t/${teamId}/roster/${entryId}`}>Cancel</Link>
                </Button>
              </div>
            </div>
          ) : (
            <Button asChild variant="destructive">
              <Link href={`/t/${teamId}/roster/${entryId}?confirm=remove`}>
                Remove player
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
