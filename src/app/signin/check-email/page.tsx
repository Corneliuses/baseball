import { cookies } from "next/headers";
import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messageFor } from "@/lib/error-messages";
import { readPendingSignIn } from "@/lib/pending-signin-cookie";

import { CODE_ENTRY_MESSAGES } from "../signin-messages";
import { CodeEntryForm } from "./CodeEntryForm";

export const metadata = {
  title: "Enter your code — Youth Baseball Team Manager",
};

/// Where every sign-in attempt lands, invited or not — now as the code-entry
/// form (#60). The wording deliberately stops short of promising that an
/// email was sent: for an address with no invitation, none was. Saying
/// otherwise here would give away who is on a team to anyone willing to type
/// addresses into the form. The address shown back is the one the person just
/// typed, so echoing it reveals nothing either.
///
/// The pending cookie expires with the code, so a stale tab or a direct visit
/// gets the start-over card instead of a form whose submission can only fail.
///
/// `?error=` here is only ever `wrong-code`, put there by `/signin` when
/// Auth.js rejects a redeem while this cookie is still live. A mistyped code
/// never reaches the query string at all — the form owns that failure and
/// keeps the characters (see `CodeEntryForm`).
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = messageFor(CODE_ENTRY_MESSAGES, error);

  const cookieStore = await cookies();
  const pending = readPendingSignIn((name) => cookieStore.get(name)?.value);

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
            <CodeEntryForm serverMessage={errorMessage} />
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
            </Link>{" "}
            — asking for a new code replaces the one we already sent.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
