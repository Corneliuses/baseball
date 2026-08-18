import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/PageContainer";
import { TeamNav } from "@/components/TeamNav";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import type { Role } from "@/generated/prisma/enums";
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

  let role: Role;
  try {
    ({ role } = await requireTeamAccess(teamId, { intent: "read" }));
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
      {/* The team's own header band: name, switcher, and the persistent nav.
          TeamNav's role prop only decides which links render — every page
          underneath still calls requireTeamAccess for itself. */}
      <div className="mb-6 space-y-4 border-b-2 border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            {/* Always rendered, unlike TeamSwitcher (which hides itself for
                single-team callers): the same family accumulates teams across
                seasons, and the selection page at / is the only place to see
                them all — so the way back must not depend on how many teams
                this person has today.

                Deliberately NOT the outline-Button back link the inner pages
                use (e.g. schedule/[eventId]): this sits over the team name on
                every screen, and a button there outshouts the heading it
                belongs to. It reads as a breadcrumb instead — but it still
                keeps Button's full focus recipe (ring-offset-background
                included, or the ring offset falls back to white in dark mode)
                and pads its hit area outward with -m-2/p-2 so the visual
                stays a quiet text link while the tap target does not. */}
            <Link
              href="/"
              className="-m-2 inline-flex items-center gap-1.5 rounded-md p-2 text-sm font-semibold text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span aria-hidden="true">←</span>
              All teams
            </Link>
            <Link href={`/t/${teamId}`} className="block">
              <h2 className="font-display text-2xl text-foreground">
                {team.name}
              </h2>
            </Link>
          </div>
          <TeamSwitcher teams={switcherTeams} currentTeamId={teamId} />
        </div>
        <TeamNav teamId={teamId} role={role} />
      </div>
      {children}
    </PageContainer>
  );
}
