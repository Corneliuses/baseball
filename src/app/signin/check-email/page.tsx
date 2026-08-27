import { cookies } from "next/headers";
import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messageFor, messageTable } from "@/lib/error-messages";
import {
  PENDING_SIGNIN_COOKIE_NAMES,
  parsePendingSignIn,
} from "@/lib/pending-signin-cookie";

import { submitSignInCode } from "../actions";

export const metadata = {
  title: "Enter your code — Youth Baseball Team Manager",
};

const ERROR_MESSAGES = messageTable({
  "invalid-code":
    "That doesn't look like a code — it's 8 letters and numbers, like K3M7-QP2X.",
});

/// Where every sign-in attempt lands, invited or not — now as the code-entry
/// form (#60). The wording deliberately stops short of promising that an
/// email was sent: for an address with no invitation, none was. Saying
/// otherwise here would give away who is on a team to anyone willing to type
/// addresses into the form. The address shown back is the one the person just
/// typed, so echoing it reveals nothing either.
///
/// The pending cookie expires with the code, so a stale tab or a direct visit
/// gets the start-over card instead of a form whose submission can only fail.
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = messageFor(ERROR_MESSAGES, error);

  const cookieStore = await cookies();
  const pending = parsePendingSignIn(
    PENDING_SIGNIN_COOKIE_NAMES.map(
      (name) => cookieStore.get(name)?.value,
    ).find((value) => value !== undefined),
  );

  if (!pending) {
    return (
      <PageContainer>
        <div className="mx-auto w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Ask for a new code</CardTitle>
              <CardDescription>
                Sign-in codes only last ten minutes, and this one&apos;s window
                has closed.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                <Link
                  href="/signin"
                  className="font-medium text-primary underline"
                >
                  Enter your email
                </Link>{" "}
                and we&apos;ll send a fresh one.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              If {pending.email} is on a team, a sign-in code is on its way.
              Type it below — it works once and expires in ten minutes.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form action={submitSignInCode} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-foreground"
                >
                  Sign-in code
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  // The one autofill hint that matters: on a phone the code
                  // arrives as a notification, and this lets the keyboard
                  // offer it without a trip to the mail app.
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  maxLength={12}
                  placeholder="K3M7-QP2X"
                  aria-describedby={errorMessage ? "code-error" : undefined}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-lg tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errorMessage ? (
                  <p
                    id="code-error"
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {errorMessage}
                  </p>
                ) : null}
              </div>

              {/* This screen's one banana (design-plan.md §2), matching the
                  request form it follows. */}
              <SubmitButton
                className="w-full bg-banana text-banana-foreground hover:bg-banana/90"
                pendingLabel="Signing you in…"
              >
                Sign in
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            Capitals don&apos;t matter, and neither does the dash. Nothing
            after a few minutes? Check your spam folder, then make sure you
            used the same address your coach has for you.
          </p>
          <p>
            <Link href="/signin" className="font-medium text-primary underline">
              Use a different address
            </Link>
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
