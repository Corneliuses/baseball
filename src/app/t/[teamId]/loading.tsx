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
/// Arriving at a team from elsewhere, or switching teams, waits for the layout
/// first. The layout reads the database before this boundary exists, and Next
/// blocks a navigation on a layout's uncached reads (file-conventions/
/// loading.md, "Good to know"), so the old page holds until the team header is
/// ready and this fallback then shows under it. There is deliberately no root
/// loading.tsx to cover that pause: see src/app/profile/loading.tsx for why.
///
/// A page's own notFound() or redirect() now runs after this fallback has been
/// sent, so on a cold load it answers 200 and finishes in the browser. The
/// membership check is unaffected, because it runs in the layout above the
/// boundary and still returns a real 404.
export default function TeamLoading() {
  return <LoadingInterstitial />;
}
