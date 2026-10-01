import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingInterstitial } from "@/components/LoadingInterstitial";

/// The spinning ball for every navigation that crosses out of, or into, a
/// team: Game Day → Profile, Profile → a team, "All teams" → a team.
///
/// The team segment's own loading.tsx cannot show for those. It lives inside
/// /t/[teamId]/layout.tsx, and that layout reads the database (the access
/// check, the team, the switcher's team list) before any boundary beneath it
/// exists — Next blocks the navigation on a layout's uncached reads
/// (file-conventions/loading.md, "Good to know"). This boundary sits above
/// the team segment, so it is already on the client when the tap happens.
///
/// It wraps itself in PageContainer because the root layout draws no chrome;
/// each page does. Without it the header band would vanish for the length of
/// the navigation and reappear with the page.
export default function RootLoading() {
  return (
    <PageContainer>
      <LoadingInterstitial />
    </PageContainer>
  );
}
