import type { Sport } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/app-name";
import { sportTheme } from "@/lib/sport";

/// The app's own mark, outside any baseball team: the same single ear of corn
/// as the app icon (public/favicon.svg), so the owner's team list, sign-in,
/// profile and invitations carry no sport at all. Drawn from the file rather
/// than copied inline so the header and the home-screen icon cannot drift.
function AppCrest() {
  return (
    // A static 32px SVG from public/: next/image would add nothing to it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/favicon.svg"
      alt=""
      width={32}
      height={32}
      className="w-8 h-8 inline-block mr-2"
      data-crest="neutral"
    />
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

/// `sport` is passed by the team layout only: it puts the whole page — header
/// band included — under that sport's palette (`data-sport`, globals.css).
/// Pages outside a team have no sport and keep the default theme, with the
/// app's neutral crest on a plain band. Only a baseball team's header gets the
/// baseball crest and pinstripes; any other sport keeps the neutral crest
/// rather than borrowing baseball's.
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
    <div
      data-sport={sport ? sportTheme(sport) : undefined}
      className="min-h-screen flex flex-col bg-background text-foreground"
    >
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
            {baseball ? <BaseballCornIcon /> : <AppCrest />}
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
