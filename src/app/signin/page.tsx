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

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

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
                  aria-describedby={error ? "email-error" : undefined}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {error === "invalid-email" ? (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    That doesn&apos;t look like an email address — check it and
                    try again.
                  </p>
                ) : null}
              </div>

              <Button type="submit" className="w-full">
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
