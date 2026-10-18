import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { safeCallbackUrl } from "@/lib/callback-url";
import { messageFor } from "@/lib/error-messages";
import { SIGNIN_MESSAGES } from "./signin-messages";

export const metadata = {
  title: "Sign in — Youth Baseball Team Manager",
};

const FALLBACK_ERROR_MESSAGE =
  "Something went wrong signing you in. Please try again.";

/// The way in: one button that starts a login with the auth service (Kernel
/// ID), which mails a code or hands off to Google and sends the browser back to
/// `/api/auth/callback`. The service proves who someone is; the callback's gate
/// decides whether they get in, and every way that can fail lands back here as
/// `?error=` (see `signin-messages.ts`).
///
/// No form and no cookies: the page only builds links. Both are plain `<a>`,
/// never `next/link`, so nothing prefetches a login — a prefetch would mint a
/// pending-login cookie on hover, and the router would fetch the target as RSC,
/// which a redirect to another origin cannot satisfy.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const returnTo = safeCallbackUrl(callbackUrl);

  const errorMessage = messageFor(SIGNIN_MESSAGES, error, FALLBACK_ERROR_MESSAGE);

  const signInHref = `/api/auth/login?${new URLSearchParams({
    callbackUrl: returnTo,
  })}`;

  // After the auth service signed in the wrong person, a plain retry would
  // reuse that same single-sign-on session; `prompt=login` makes the service
  // ask again.
  const differentAccountHref =
    error === "account-mismatch" || error === "not-invited"
      ? `/api/auth/login?${new URLSearchParams({
          prompt: "login",
          callbackUrl: returnTo,
        })}`
      : null;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Sign in with Kernel ID, using a code we email you or your Google
              account. No password to remember at the field.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMessage ? (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}

            {/* This screen's one banana (design-plan.md §2). */}
            <Button
              asChild
              className="w-full bg-banana text-banana-foreground hover:bg-banana/90"
            >
              <a href={signInHref}>Sign in with Kernel ID</a>
            </Button>

            {differentAccountHref ? (
              <p className="text-center text-sm">
                <a
                  href={differentAccountHref}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Use a different account
                </a>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          This app is invite-only. Your coach adds you to a team; sign in with
          the address they used.
        </p>
      </div>
    </PageContainer>
  );
}
