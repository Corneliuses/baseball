import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isOwnerEmail } from "@/lib/owner";
import { getCurrentUser } from "@/lib/session";

import { NewTeamForm } from "./NewTeamForm";

export const metadata = {
  title: "New team — Youth Baseball Team Manager",
};

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
          <NewTeamForm redirectErrorCode={error} />
        </CardContent>
      </Card>
    </div>
  );
}
