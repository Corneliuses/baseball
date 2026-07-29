import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/PageContainer";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { isOwnerEmail } from "@/lib/owner";
import { getCurrentUser } from "@/lib/session";
import { requireTeamAccess, TeamAccessError } from "@/lib/team-access";
import { getAllTeams, getMemberTeams, getTeamById } from "@/lib/teams";

/// Chrome and a fail-fast access check for every route under /t/[teamId].
///
/// This check alone is NOT the authorization boundary — layouts don't
/// re-render on client-side navigation, so a check living only here would be
/// evaluated once and then trusted on every subsequent transition between
/// sibling pages. Every page.tsx beneath this layout calls requireTeamAccess
/// again itself. See design-doc.md #3 Decision 6.
///
/// A bare `catch` here is deliberately avoided: only a TeamAccessError is
/// treated as "no access" (-> notFound()). Anything else (a database outage)
/// propagates to the nearest error boundary instead of being reported as a
/// routine 404.
export default async function TeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  try {
    await requireTeamAccess(teamId, { intent: "read" });
  } catch (error) {
    if (error instanceof TeamAccessError) {
      notFound();
    }
    throw error;
  }

  const team = await getTeamById(teamId);
  if (!team) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!user) {
    // Unreachable in practice — requireTeamAccess above already proved a
    // session exists — but narrows the type without a non-null assertion.
    notFound();
  }

  const owner = isOwnerEmail(user.email, process.env.OWNER_EMAIL);
  const switcherTeams = owner
    ? await getAllTeams()
    : await getMemberTeams(user.id);

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <h2 className="text-2xl font-bold text-foreground">{team.name}</h2>
        <TeamSwitcher teams={switcherTeams} currentTeamId={teamId} />
      </div>
      {children}
    </PageContainer>
  );
}
