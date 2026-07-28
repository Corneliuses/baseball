import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { db } from "@/lib/db";
import { acceptInvitations, loadSignInContext } from "@/lib/invitations";
import { decideSignIn } from "@/lib/signin-gate";

/// Auth.js v5 — magic link only, gated by the Invitation table.
///
/// This file is deliberately thin. Every decision worth asserting lives in a pure
/// module (owner.ts, signin-gate.ts) that tests without a database; what remains
/// here is wiring.
///
/// Note the lazy config form: `NextAuth(() => config)` evaluates the config per
/// request rather than at import, so a missing RESEND_API_KEY fails when someone
/// actually tries to sign in instead of at build time. src/lib/db.ts defers
/// DATABASE_URL for the same reason — the build must not require secrets.

/// Long enough that a parent at a ballfield is not re-authenticating on a phone,
/// sliding so that opening the app keeps it alive. Database sessions make this
/// safe: a 90-day window is revocable by deleting the row.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example`);
  }
  return value;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: PrismaAdapter(db),

  providers: [
    Resend({
      apiKey: requireEnv("RESEND_API_KEY"),
      // Must be explicit. The provider's default `from` is an authjs.dev address
      // that this project does not control, and mail from an unverified domain
      // is the difference between parents seeing invitations and never finding
      // them.
      from: requireEnv("EMAIL_FROM"),
    }),
  ],

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
  // sameSite "lax", and lax is load-bearing twice over: a magic link clicked in
  // an email client is a cross-site top-level navigation that "strict" would
  // silently drop, and same-origin service worker fetches need the cookie too.

  callbacks: {
    /**
     * The gate. This runs twice per sign-in: once when the link is requested
     * (`email.verificationRequest`) and again when it is clicked. Rejecting on
     * the first pass means an uninvited address never receives mail at all;
     * rejecting on the second covers an invitation that expired in between.
     */
    async signIn({ user, email }) {
      const address = user.email;
      if (!address) {
        return false;
      }

      const stage = email?.verificationRequest ? "link request" : "link click";

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
     * Turn accepted invitations into team access. This fires only after a link
     * is actually clicked and the session exists — doing it in the signIn
     * callback instead would grant memberships to anyone who typed an address
     * into the form, since that callback also runs on the send path.
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
