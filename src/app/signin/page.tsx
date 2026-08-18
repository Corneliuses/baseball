import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { requestSignInLink } from "./actions";

export const metadata = {
  title: "Sign in — Youth Baseball Team Manager",
};

/// `pages.error` points at this page, so Auth.js's own error screen never
/// renders and its copy has to live here instead. Without this map a parent
/// whose link expired lands on a bare form with no idea what went wrong.
///
/// The two link failures say the same thing on purpose. AccessDenied only
/// reaches this page from a click — the send path always ends on
/// /signin/check-email — but naming the reason would still leak whether an
/// invitation exists, so both get the neutral wording.
const ERROR_MESSAGES: Record<string, string> = {
  "invalid-email":
    "That doesn't look like an email address — check it and try again.",
  Verification:
    "That sign-in link has expired or was already used. Enter your email and we'll send a fresh one.",
  AccessDenied:
    "That sign-in link is no longer valid. Enter your email to try again, or ask your coach to send a new invite.",
  Configuration:
    "Something is wrong on our end, and it has been logged. Please try again in a few minutes.",
};

const FALLBACK_ERROR_MESSAGE =
  "Something went wrong signing you in. Enter your email and try again.";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? FALLBACK_ERROR_MESSAGE)
    : null;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a link that signs you in.
              No password to remember at the field.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form action={requestSignInLink} className="space-y-4">
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
              <Button
                type="submit"
                className="w-full bg-banana text-banana-foreground hover:bg-banana/90"
              >
                Email me a sign-in link
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          This app is invite-only. Your coach adds you to a team, and the link
          arrives at the address they used.
        </p>
      </div>
    </PageContainer>
  );
}
