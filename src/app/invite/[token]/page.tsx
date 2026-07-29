import type { ReactNode } from "react";
import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInvitationByToken } from "@/lib/invitations";
import { isLiveInvitation } from "@/lib/invitation-token";

import { requestInvitationLinkAction } from "./actions";

export const metadata = {
  title: "You're invited — Youth Baseball Team Manager",
};

/// Masks all but the first character of the local part, so the page can
/// confirm which address will receive mail without fully disclosing it to
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
/// route is deliberately outside it. The token is the only credential: it
/// authorizes sending mail to the address on the row, nothing more. Granting
/// access itself happens later, when that emailed link is clicked — see
/// design-doc.md #4 Decision 1.
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { token } = await params;
  const { sent } = await searchParams;

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
          description="This invitation has already been used. Sign in from the regular sign-in page instead."
        >
          <Button asChild variant="outline" className="w-full">
            <Link href="/signin">Go to sign in</Link>
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
              We&apos;ll email a one-time sign-in link to {maskEmail(invitation.email)}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <p role="status" className="text-sm text-muted-foreground">
                Check your email for the sign-in link.
              </p>
            ) : (
              <form action={requestInvitationLinkAction}>
                <input type="hidden" name="token" value={token} />
                <Button type="submit" className="w-full">
                  Send me a sign-in link
                </Button>
              </form>
            )}
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
