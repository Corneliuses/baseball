import type { Metadata } from "next";
import { LazyMotion, domAnimation } from "motion/react";
import { Alfa_Slab_One, Geist, Geist_Mono } from "next/font/google";
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
  icons: {
    icon: "/favicon.svg",
  },
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
        <LazyMotion features={domAnimation}>{children}</LazyMotion>
      </body>
    </html>
  );
}
