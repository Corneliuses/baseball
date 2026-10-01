import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingInterstitial } from "@/components/LoadingInterstitial";

/// The spinning ball for the one nav tab that leaves the team: Profile.
///
/// /t/[teamId]/loading.tsx cannot cover it. That boundary sits inside the
/// team layout, and /profile is not under /t at all, so tapping Profile from
/// any team page used to freeze on the old page until this one rendered.
///
/// It lives here rather than at src/app/loading.tsx on purpose. A root
/// boundary would cover this tab too, but it wraps every route in the app,
/// and a page streamed behind a Suspense fallback has already sent its
/// headers. Every server notFound() and redirect() beneath it would then
/// answer 200 and finish in the browser, instead of 404 or 307. That
/// includes the team layout's membership check and the sign-in bounces.
/// Here the cost is this page's own redirect for a stale session only.
///
/// It wraps itself in PageContainer because the root layout draws no chrome;
/// each page does. Without it the header band would vanish for the length of
/// the navigation and come back with the page.
export default function ProfileLoading() {
  return (
    <PageContainer>
      <LoadingInterstitial />
    </PageContainer>
  );
}
