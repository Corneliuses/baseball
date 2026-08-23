import Link from "next/link";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/PageContainer";
import { PushOptInCard } from "@/components/PushOptInCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { messageFor, messageTable } from "@/lib/error-messages";
import { getProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/session";

import { signOutAction, updateProfileAction } from "./actions";

export const metadata = {
  title: "Your profile — Youth Baseball Team Manager",
};

// messageTable, never a bare literal — see src/lib/error-messages.ts.
const ERROR_MESSAGES = messageTable({
  "invalid-phone": "Phone number must be 32 characters or fewer.",
  "save-failed": "Your changes couldn't be saved. Try again.",
  "signout-failed": "Signing out didn't work. Try again.",
});

/// The one place a person sees and fixes what the team has on file for them.
///
/// This exists because the contact details are otherwise written *about* them
/// and never shown *to* them: a coach types a parent's phone on the roster
/// entry page, that number is what the staff directory dials, and until this
/// page there was no screen anywhere in the app where the parent could read
/// it back. A transposed digit was therefore undetectable by the only person
/// who knows it is wrong.
///
/// Deliberately global rather than under /t/[teamId]: name and phone are
/// columns on User, one per person, not per team. Proxy matches /profile so a
/// signed-out visitor is bounced to sign-in before the page runs, but Proxy
/// is optimistic (cookie presence, not validity), so the real check is here.
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect("/signin?callbackUrl=%2Fprofile");
  }

  const profile = await getProfile(user.id);
  if (!profile) {
    redirect("/signin?callbackUrl=%2Fprofile");
  }

  const errorMessage = messageFor(ERROR_MESSAGES, error);

  // Read at request time and handed down as a prop rather than declared as a
  // NEXT_PUBLIC_ variable: the key is not a secret (every subscriber receives
  // it), but inlining it would make the build depend on the environment, which
  // src/lib/email.ts and src/auth.ts both deliberately avoid. Null on a
  // deployment with no VAPID keys, and the card simply does not render —
  // reminder emails are unaffected either way.
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-foreground">Your profile</h2>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Back</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>
              This is what your coaches see for you. Your phone number is
              visible to the coaching staff of your teams, not to other
              parents.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form action={updateProfileAction} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  defaultValue={profile.name ?? ""}
                  placeholder="Your name"
                  aria-describedby={errorMessage ? "profile-error" : undefined}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={profile.phone ?? ""}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank if you would rather not have a number on file.
                </p>
              </div>

              <div className="space-y-2">
                <p className="block text-sm font-medium text-foreground">Email</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                <p className="text-xs text-muted-foreground">
                  This is the address you sign in with. Ask your coach if it
                  needs to change.
                </p>
              </div>

              {errorMessage ? (
                <p id="profile-error" role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}

              {saved && !errorMessage ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Saved.
                </p>
              ) : null}

              <Button type="submit" className="w-full">
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {vapidPublicKey ? (
          <PushOptInCard vapidPublicKey={vapidPublicKey} />
        ) : null}

        <form action={signOutAction} className="space-y-2">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Signs you out on this device only. Sign back in any time with an
            email link.
          </p>
        </form>
      </div>
    </PageContainer>
  );
}
