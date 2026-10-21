"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Sport } from "@/generated/prisma/enums";

/// The current team's sport, for client components that render with no data.
///
/// `src/app/t/[teamId]/loading.tsx` takes no params and runs before any page
/// data exists, so the only thing above it that knows the team is the team
/// layout. A client context is the one channel from that server layout to a
/// client fallback that does not add a read: the layout already has `team`,
/// and wraps `{children}` in this provider. The fallback renders inside the
/// layout (AGENTS.md "The loading ball…"), so it sees the value.
///
/// The default is baseball, and that is what everything outside a team gets —
/// `/profile` is global, not team-scoped, and the root layout knows no team.
///
/// The type is imported, never the generated enum object, so the Prisma
/// client's runtime stays out of the browser bundle.
const SportContext = createContext<Sport>("BASEBALL");

export function SportProvider({
  sport,
  children,
}: {
  sport: Sport;
  children: ReactNode;
}) {
  return <SportContext.Provider value={sport}>{children}</SportContext.Provider>;
}

export function useSport(): Sport {
  return useContext(SportContext);
}
