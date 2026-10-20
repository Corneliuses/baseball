import type { ReactNode } from "react";
import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/app-name";
import { getInvitationByToken } from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";

import { acceptInvitationAction } from "./actions";

export const metadata = {
  title: `You're invited — ${APP_NAME}`,
};

/// Masks all but the first character of the local part, so the page can
/// confirm which address the coach has on file without fully disclosing it to
/// anyone who guesses or intercepts the link.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) {
    return email;
  }
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 3))}@${domain}`;
}

/// Unauthenticated by design — proxy.ts's matcher is "/t/:path*" and this
/// route is deliberately outside it. The token is the credential, and this
/// page only reads it: accepting is the POST in actions.ts, which is what
/// grants the membership and starts the sign-in. Rendering must stay
/// side-effect free, because mail scanners fetch this URL before the parent
/// ever opens the message.
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <PageContainer>
        <StatusCard
          title="Invitation not found"
          description="This invitation link isn't valid. Ask your coach to check the address and send a new one."
        />
      </PageContainer>
    );
  }

  if (invitation.acceptedAt !== null) {
    return (
      <PageContainer>
        <StatusCard
          title="Already accepted"
          description="This invitation has already been used. Sign in with the address it was sent to, and you'll land on the team."
        >
          {/* Carries the team as the destination: accepting grants the
              membership before the sign-in, so a parent whose sign-in did not
              finish arrives here and still needs to reach the team. */}
          <Button asChild variant="outline" className="w-full">
            <Link
              href={`/signin?${new URLSearchParams({
                callbackUrl: `/t/${invitation.teamId}`,
              })}`}
            >
              Go to sign in
            </Link>
          </Button>
        </StatusCard>
      </PageContainer>
    );
  }

  if (!isLiveInvitation(invitation, new Date())) {
    return (
      <PageContainer>
        <StatusCard
          title="Invitation expired"
          description="This invitation has expired. Ask your coach to send a new one."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re invited to join {invitation.teamName}</CardTitle>
            <CardDescription>
              Accepting adds you to the team, then signs you in with an emailed
              code or Google. No password to remember.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                Something went wrong accepting your invitation. Try again, or
                ask your coach to send a new one.
              </p>
            ) : null}

            <form action={acceptInvitationAction}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton className="w-full" pendingLabel="Joining…">
                Accept invitation
              </SubmitButton>
            </form>

            <p className="text-sm text-muted-foreground">
              This invitation was sent to {maskEmail(invitation.email)}. It
              works once — after that, sign in from{" "}
              <Link href="/signin" className="font-medium text-primary underline">
                the sign-in page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function StatusCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? <CardContent>{children}</CardContent> : null}
      </Card>
    </div>
  );
}
