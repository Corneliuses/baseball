import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const ERROR_MESSAGES: Record<string, string> = {
  "invalid-name": "Player name is required.",
  "invalid-dob": "Enter a valid date, or leave it blank.",
  "invalid-jersey": "Jersey number must be a whole number between 0 and 99.",
  "jersey-taken": "That jersey number is already in use on this team.",
  "invalid-email": "Enter a valid email address.",
  "invalid-phone": "Phone number must be 32 characters or fewer.",
  "email-failed": "The invitation could not be sent. Try again.",
  "not-a-guardian": "That person is not a guardian of this player.",
  access: "You no longer have access to make this change.",
};

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

/// Every member reads. Editing and removal require COACH+, enforced both by
/// hiding the controls here and by requireTeamAccess inside each action —
/// this page's own check is "read" so a parent can still land here from the
/// roster list, matching the settings-page pattern of read-to-view.
export default async function RosterEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string; entryId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; invited?: string }>;
}) {
  const { teamId, entryId } = await params;
  const { error, saved, invited } = await searchParams;

  let role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
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

  const canEdit = role !== "PARENT";
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? "Something went wrong.") : null;

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
          {canEdit ? (
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

              <Button type="submit" className="w-full">
                Save changes
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              {entry.player.dateOfBirth
                ? `Born ${toDateInputValue(entry.player.dateOfBirth)}`
                : "No date of birth on file."}
            </p>
          )}
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
                      {!canEdit && guardian.phone ? (
                        <p className="text-sm text-muted-foreground">{guardian.phone}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {guardianStatus(guardian)}
                      </p>
                    </div>
                    {canEdit ? (
                      <div className="flex shrink-0 gap-2">
                        {!guardian.hasSignedIn ? (
                          <form action={resendInvitationAction}>
                            <input type="hidden" name="teamId" value={teamId} />
                            <input type="hidden" name="entryId" value={entryId} />
                            <input type="hidden" name="userId" value={guardian.id} />
                            <Button type="submit" variant="outline" size="sm">
                              Resend
                            </Button>
                          </form>
                        ) : null}
                        <form action={unlinkGuardianAction}>
                          <input type="hidden" name="teamId" value={teamId} />
                          <input type="hidden" name="entryId" value={entryId} />
                          <input type="hidden" name="userId" value={guardian.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Unlink
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                  {canEdit ? (
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
                      <Button type="submit" variant="outline" size="sm">
                        Save phone
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
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
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Remove from roster</CardTitle>
            <CardDescription>
              Removes this player&apos;s spot on this team only. The player and their
              guardians are not deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={removeRosterEntryAction}>
              <input type="hidden" name="teamId" value={teamId} />
              <input type="hidden" name="entryId" value={entryId} />
              <Button type="submit" variant="destructive">
                Remove player
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
