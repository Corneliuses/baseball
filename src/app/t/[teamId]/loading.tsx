import { LoadingInterstitial } from "@/components/LoadingInterstitial";

/// The spinning ball between tabs.
///
/// Next wraps every page under /t/[teamId] in a Suspense boundary with this as
/// its fallback, so switching from Schedule to Game Day shows it the instant
/// the tab is tapped, under the team header and nav that stay put, until the
/// new page's data arrives. It is a sibling of layout.tsx and renders *inside*
/// it — which is why there is no PageContainer here: the layout already drew
/// the header band, and a fallback that drew another would flash two.
///
/// It does nothing for the first arrival at a team from elsewhere. The layout
/// reads the database before this boundary exists, and Next blocks the
/// navigation on a layout's uncached reads (file-conventions/loading.md,
/// "Good to know"). src/app/loading.tsx, above the team segment, covers that
/// leg.
export default function TeamLoading() {
  return <LoadingInterstitial />;
}
