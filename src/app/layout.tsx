import type { Metadata } from "next";
import { LazyMotion, domAnimation } from "motion/react";
import { Alfa_Slab_One, Geist, Geist_Mono } from "next/font/google";

import { PwaRegistrar } from "./PwaRegistrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/// Display slab for headings and hero numbers only (design-plan.md §4) —
/// exposed as the `font-display` utility via `--font-display` in globals.css.
const alfaSlab = Alfa_Slab_One({
  variable: "--font-alfa-slab",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Youth Baseball Team Manager",
  description:
    "Manage your youth baseball team's roster, schedule, and lineup with ease.",
  /// **Declaring this block at all turns off file-convention icons.** Next
  /// gates the whole static-icon merge on `icons` being unset
  /// (`resolve-metadata.js`: `if (!resolvedMetadata.icons)`), so with this
  /// object present, `src/app/icon.*` AND `src/app/apple-icon.*` are both
  /// dropped — even though Next still serves them as routes. The one exception
  /// is `favicon.ico`, prepended by a separate unconditional special case,
  /// which is why it still appears below without being named here.
  ///
  /// So anything that is not favicon.ico has to be listed in this object, and
  /// `apple` is listed for that reason and no other. Verified against builds
  /// both ways, including one with a `src/app/icon.png` present that never
  /// reached the markup. The failure is invisible everywhere except an actual
  /// iPhone, which shows a screenshot of the page as the home-screen icon
  /// instead of the crest. `layout.test.tsx` pins the declaration;
  /// `manifest.test.ts` pins the file it points at.
  icons: {
    icon: "/favicon.svg",
    apple: { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  },
  /// Non-negotiable: this app holds children's names and jersey numbers next to
  /// their guardians' phone numbers and email addresses. It is invite-only and
  /// must never appear in a search index. `src/app/manifest.ts` deliberately
  /// does not undo this — a manifest makes an app installable, not public.
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${alfaSlab.variable} h-full antialiased`}
    >
      <body className="h-full">
        <PwaRegistrar />
        <LazyMotion features={domAnimation}>{children}</LazyMotion>
      </body>
    </html>
  );
}
