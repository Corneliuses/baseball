import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { withSingleLiveCode } from "@/lib/auth-adapter";
import { db } from "@/lib/db";
import { acceptInvitations, loadSignInContext } from "@/lib/invitations";
import { resendProvider } from "@/lib/resend-provider";
import { decideSignIn } from "@/lib/signin-gate";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/sessions";

/// Auth.js v5 — emailed sign-in codes only, gated by the Invitation table.
///
/// The email provider's token is a typed code rather than a tappable link
/// (#60): see resendProvider(), which supplies `generateVerificationToken`
/// and replaces the send. Everything here — the gate, the events, sessions —
/// is unchanged by that, because a typed code redeems through the same
/// /api/auth/callback/resend?token=&email= the link carried.
///
/// This file is deliberately thin. Every decision worth asserting lives in a pure
/// module (owner.ts, signin-gate.ts) that tests without a database; what remains
/// here is wiring.
///
/// Note the lazy config form: `NextAuth(() => config)` evaluates the config per
/// request rather than at import, so the build must not require secrets — same
/// reason src/lib/db.ts defers DATABASE_URL. But per-request is not the same as
/// per-send: every page calls auth() to read the session, so a RESEND_API_KEY
/// check that merely sat in this factory would throw on every single page view,
/// not just a sign-in attempt — including a signed-out visitor on the marketing
/// page, who triggers no email at all. resendProvider() (src/lib/resend-provider.ts)
/// pushes that check one level further in, to the moment sendVerificationRequest
/// actually fires, which is only the "request a sign-in code" step of sign-in.

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  // Wrapped so requesting a code invalidates the address's previous one. The
  // 40-bit code assumes exactly one live code per address; the table's unique
  // indexes do not provide that on their own. See lib/auth-adapter.ts.
  adapter: withSingleLiveCode(PrismaAdapter(db)),

  providers: [resendProvider()],

  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },

  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin",
  },

  // No `cookies` block on purpose. The Auth.js defaults are httpOnly and
  // sameSite "lax", and lax is load-bearing twice over: an invitation link
  // clicked in an email client is a cross-site top-level navigation that
  // "strict" would silently drop, and same-origin service worker fetches need
  // the cookie too.

  callbacks: {
    /**
     * The gate. This runs twice per sign-in: once when the code is requested
     * (`email.verificationRequest`) and again when it is redeemed. Rejecting
     * on the first pass means an uninvited address never receives mail at
     * all; rejecting on the second covers an invitation that expired in
     * between.
     */
    async signIn({ user, email }) {
      const address = user.email;
      if (!address) {
        return false;
      }

      const stage = email?.verificationRequest ? "code request" : "code redeem";

      try {
        const context = await loadSignInContext(address);
        const decision = decideSignIn({
          email: address,
          ownerEmail: process.env.OWNER_EMAIL,
          invitations: context.invitations,
          hasMembership: context.hasMembership,
          now: new Date(),
        });

        if (!decision.allowed) {
          console.warn(`Sign-in denied at ${stage}: ${decision.reason}`);
          return false;
        }

        return true;
      } catch (error) {
        // Fail closed. A database outage must not open the gate.
        console.error(`Sign-in gate failed at ${stage}:`, error);
        return false;
      }
    },

    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },

  events: {
    /**
     * Turn accepted invitations into team access. This fires only after a
     * code is actually redeemed and the session exists — doing it in the
     * signIn callback instead would grant memberships to anyone who typed an
     * address into the form, since that callback also runs on the send path.
     */
    async signIn({ user }) {
      if (!user.id || !user.email) {
        return;
      }

      try {
        await acceptInvitations(user.id, user.email);
      } catch (error) {
        // Logged and swallowed: the user is already signed in, and failing here
        // would break a valid login over a row the next sign-in will retry.
        console.error("Failed to accept invitations on sign-in:", error);
      }
    },
  },
}));
