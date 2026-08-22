import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messageFor, messageTable } from "@/lib/error-messages";
import { isOwnerEmail } from "@/lib/owner";
import { getCurrentUser } from "@/lib/session";

import { createTeamAction } from "./actions";

export const metadata = {
  title: "New team — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-name": "Team name is required.",
  "create-failed": "Something went wrong creating the team. Try again.",
  access: "You don't have access to create a team.",
});

/// /t/new is a sibling of /t/[teamId], not a child of it — there is no
/// teamId yet to run requireTeamAccess against, so ownership is checked
/// directly. The action re-checks independently; this page-level check only
/// decides what to render.
export default async function NewTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const user = await getCurrentUser();
  if (!isOwnerEmail(user?.email, process.env.OWNER_EMAIL)) {
    notFound();
  }

  const errorMessage = messageFor(ERROR_MESSAGES, error);

  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Create a team</CardTitle>
          <CardDescription>
            You&apos;ll be added as the owner of this team.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={createTeamAction} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                Team name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoFocus
                placeholder="Sharks"
                aria-describedby={errorMessage ? "new-team-error" : undefined}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="season" className="block text-sm font-medium text-foreground">
                Season
              </label>
              <input
                id="season"
                name="season"
                type="text"
                placeholder="2026"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="allPlay"
                name="allPlay"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="allPlay" className="text-sm text-foreground">
                Every kid bats and fields (all-play)
              </label>
            </div>

            {errorMessage ? (
              <p id="new-team-error" role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" className="w-full">
              Create team
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
