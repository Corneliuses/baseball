import { db } from "@/lib/db";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@/generated/prisma/client";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { isOwnerEmail } from "@/lib/owner";

const prismaForAdapter = db as unknown as PrismaClient;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prismaForAdapter),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    signIn: async ({ user }) => {
      if (!user.email) return false;

      const ownerEmail = process.env.OWNER_EMAIL;
      if (isOwnerEmail(user.email, ownerEmail)) {
        return true;
      }

      const invitation = await prismaForAdapter.invitation.findFirst({
        where: {
          email: user.email,
          expiresAt: { gt: new Date() },
          acceptedAt: null,
        },
      });

      if (invitation) {
        await prismaForAdapter.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        return true;
      }

      const existingMembership = await prismaForAdapter.membership.findFirst({
        where: { user: { email: user.email } },
      });

      return !!existingMembership;
    },
  },
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/signin",
  },
});
