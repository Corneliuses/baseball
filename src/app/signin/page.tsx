import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/PageContainer";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { requestSignInCode } from "./actions";
import { safeCallbackUrl } from "@/lib/callback-url";
import { messageFor, messageTable } from "@/lib/error-messages";
import { readPendingSignIn } from "@/lib/pending-signin-cookie";
import { SIGNIN_MESSAGES } from "./signin-messages";

export const metadata = {
  title: "Sign in — Youth Baseball Team Manager",
};

/// `pages.error` points at this page, so Auth.js's own error screen never
/// renders and its copy has to live here instead. Without this map a parent
/// whose code expired lands on a bare form with no idea what went wrong.
///
/// The two code failures say the same thing on purpose. AccessDenied only
/// reaches this page from a redeem — the send path always ends on
/// /signin/check-email — but naming the reason would still leak whether an
/// invitation exists, so both get the neutral wording. `code-expired` is this
/// app's own key, set by `submitSignInCode` when the pending cookie is gone.
///
/// `Verification` keeps its wording for the case where the code really is
/// spent, but most arrivals never see it: with a live pending cookie the
/// loader below sends them back to the entry form instead.
const ERROR_MESSAGES = messageTable({
  "invalid-email":
    "That doesn't look like an email address — check it and try again.",
  "code-expired":
    "That sign-in code has expired. Enter your email and we'll send a fresh one.",
  Verification:
    "That sign-in code didn't match or has expired. Enter your email and we'll send a fresh one.",
  AccessDenied:
    "That sign-in code is no longer valid. Enter your email to try again, or ask your coach to send a new invite.",
  Configuration:
    "Something is wrong on our end, and it has been logged. Please try again in a few minutes.",
  // The auth service callback's keys (`GET /api/auth/callback`), live ahead of
  // the cutover so a login started from `/api/auth/login` reads properly.
  ...SIGNIN_MESSAGES,
});

const FALLBACK_ERROR_MESSAGE =
  "Something went wrong signing you in. Enter your email and try again.";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  // A wrong-but-well-formed code lands here, because `pages.error` is global
  // and Auth.js has nowhere else to send a failed redeem. Bouncing it back to
  // the entry form is the difference between "type that again" and "we have
  // thrown away the code you were holding, ask for another email" — the
  // mailed code and this cookie expire together, so a live cookie means there
  // is still something worth retyping.
  //
  // Only `Verification`. `AccessDenied` means the gate refused the address,
  // and no amount of retyping changes that.
  if (error === "Verification") {
    const cookieStore = await cookies();
    const pending = readPendingSignIn((name) => cookieStore.get(name)?.value);

    if (pending) {
      redirect("/signin/check-email?error=wrong-code");
    }
  }

  const errorMessage = messageFor(ERROR_MESSAGES, error, FALLBACK_ERROR_MESSAGE);

  // After the auth service signed in the wrong person, a plain retry would
  // reuse that same single-sign-on session; `prompt=login` makes the service
  // ask again. A plain <a>, never next/link, so nothing prefetches a login.
  const differentAccountHref =
    error === "account-mismatch" || error === "not-invited"
      ? `/api/auth/login?${new URLSearchParams({
          prompt: "login",
          callbackUrl: safeCallbackUrl(callbackUrl),
        })}`
      : null;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a code that signs you in.
              No password to remember at the field.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form action={requestSignInCode} className="space-y-4">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  placeholder="you@example.com"
                  aria-describedby={errorMessage ? "email-error" : undefined}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errorMessage ? (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {errorMessage}
                  </p>
                ) : null}
              </div>

              {/* This screen's one banana (design-plan.md §2). */}
              <SubmitButton
                className="w-full bg-banana text-banana-foreground hover:bg-banana/90"
                pendingLabel="Sending the code…"
              >
                Email me a sign-in code
              </SubmitButton>
            </form>

            {differentAccountHref ? (
              <p className="mt-4 text-center text-sm">
                <a
                  href={differentAccountHref}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Use a different account
                </a>
              </p>
            ) : null}

            {/* Temporary, for testing the auth service sign-in from the
                installed app before the B4 cutover replaces this form. A plain
                <a>, never next/link, so nothing prefetches a login. */}
            {differentAccountHref ? null : (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                <a
                  href={`/api/auth/login?${new URLSearchParams({
                    callbackUrl: safeCallbackUrl(callbackUrl),
                  })}`}
                  className="underline underline-offset-4"
                >
                  Sign in with Kernel ID (beta)
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          This app is invite-only. Your coach adds you to a team, and the code
          arrives at the address they used.
        </p>
      </div>
    </PageContainer>
  );
}
