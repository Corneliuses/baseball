import type { Sport } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/app-name";

/// The app's own mark: one corn cob on a cream disc — the "Cornelius" pun with
/// no sport attached. It heads every page that belongs to no team (the team
/// list at /, sign-in, profile, invitations), so the owner's front door reads
/// the same whether the teams behind it play baseball, basketball, or both.
function CornCrestIcon() {
  return (
    <svg
      className="w-8 h-8 inline-block mr-2"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-crest="neutral"
    >
      <circle cx="32" cy="32" r="30" fill="#FAF4E5" stroke="#1E2948" strokeWidth="2.5" />
      <path
        d="M 32 9 C 35.2 9.4 36.9 12 37.4 18 C 37.7 21.5 37.75 25 37.75 29 L 37.75 42 C 37.75 49 36.3 52 32 52.5 C 27.7 52 26.25 49 26.25 42 L 26.25 29 C 26.25 25 26.3 21.5 26.6 18 C 27.1 12 28.8 9.4 32 9 Z"
        fill="#FFC72E"
        stroke="#1E2948"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <g stroke="#DD9A10" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M 30 12.5 C 29.4 18 29.4 40 30 44" />
        <path d="M 34 12.5 C 34.6 18 34.6 40 34 44" />
        <path d="M 28.6 15 Q 32 15.9 35.4 15" />
        <path d="M 28 21 Q 32 22 36 21" />
        <path d="M 27.8 27 Q 32 28 36.2 27" />
        <path d="M 27.8 33 Q 32 34 36.2 33" />
        <path d="M 27.8 39 Q 32 40 36.2 39" />
      </g>
      <g stroke="#1E2948" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M 27.5 44 C 22.5 47 20.5 52 23.5 57 C 26.5 53 28.5 49.5 30 47 Z" fill="#7FB763" />
        <path d="M 36.5 44 C 41.5 47 43.5 52 40.5 57 C 37.5 53 35.5 49.5 34 47 Z" fill="#7FB763" />
        <path d="M 28.5 46 C 28 51 30 55 32 57.5 C 34 55 36 51 35.5 46 C 34 48 30 48 28.5 46 Z" fill="#9BCC7E" />
      </g>
    </svg>
  );
}

/// A baseball team's crest: the corn-kernel baseball. Drawn only in a
/// baseball team's own header, never on a page shared across sports.
function BaseballCornIcon() {
  return (
    <svg
      className="w-8 h-8 inline-block mr-2"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-crest="baseball"
    >
      {/* Baseball circle base */}
      <circle cx="100" cy="100" r="95" fill="#f5f5dc" stroke="#8b7355" strokeWidth="2" />

      {/* Corn kernel pattern */}
      <g fill="#ffd700" opacity="0.7">
        <circle cx="65" cy="65" r="8" />
        <circle cx="75" cy="60" r="7" />
        <circle cx="82" cy="68" r="8" />
        <circle cx="72" cy="75" r="7" />

        <circle cx="135" cy="65" r="8" />
        <circle cx="125" cy="60" r="7" />
        <circle cx="118" cy="68" r="8" />
        <circle cx="128" cy="75" r="7" />

        <circle cx="65" cy="135" r="8" />
        <circle cx="75" cy="140" r="7" />
        <circle cx="82" cy="132" r="8" />
        <circle cx="72" cy="125" r="7" />

        <circle cx="135" cy="135" r="8" />
        <circle cx="125" cy="140" r="7" />
        <circle cx="118" cy="132" r="8" />
        <circle cx="128" cy="125" r="7" />

        <circle cx="100" cy="100" r="6" />
        <circle cx="110" cy="95" r="6" />
        <circle cx="90" cy="105" r="6" />
      </g>

      {/* Baseball stitching */}
      <path
        d="M 50 85 Q 70 75, 100 70 Q 130 75, 150 85"
        stroke="#dc2626"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 50 115 Q 70 125, 100 130 Q 130 125, 150 115"
        stroke="#dc2626"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/// `sport` is the team whose pages these are, when they are a team's pages.
/// Without one — the team list, sign-in, profile — the header is the app's
/// neutral chrome: the corn crest on a plain card band. A baseball team gets
/// its baseball crest and the pinstriped band back. Any other sport falls to
/// the neutral chrome until it has branding of its own, rather than borrowing
/// baseball's.
export function PageContainer({
  children,
  className,
  sport,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
  sport?: Sport;
}>) {
  const baseball = sport === "BASEBALL";
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Pinstripes are a baseball jersey's, so only a baseball team's band
          wears them — and per design-plan.md §5 they live on header surfaces
          only, never behind body text. */}
      <header
        className={cn(
          "border-b-2 border-primary/30 bg-card",
          baseball && "bg-pinstripe",
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            {baseball ? <BaseballCornIcon /> : <CornCrestIcon />}
            <h1 className="font-display text-xl text-primary sm:text-2xl">
              {APP_NAME}
            </h1>
          </div>
        </div>
      </header>
      <main className={cn("flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8", className)}>
        {children}
      </main>
    </div>
  );
}
