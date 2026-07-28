import Link from "next/link";

import { PageContainer } from "@/components/layout/PageContainer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = {
  title: "Check your email — Youth Baseball Team Manager",
};

/// Where every sign-in attempt lands, invited or not. The wording deliberately
/// stops short of promising that an email was sent: for an address with no
/// invitation, none was. Saying otherwise here would give away who is on a team
/// to anyone willing to type addresses into the form.
export default function CheckEmailPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              If that address is on a team, a sign-in link is on its way. It
              works once and expires after a day.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Nothing after a few minutes? Check your spam folder, then make
              sure you used the same address your coach has for you.
            </p>
            <p>
              Still nothing — ask your coach to check the address on your team
              and send the invite again.
            </p>
            <p>
              <Link href="/signin" className="font-medium text-primary underline">
                Try a different address
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
