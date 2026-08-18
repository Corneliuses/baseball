import { cn } from "@/lib/utils";

function BaseballCornIcon() {
  return (
    <svg
      className="w-8 h-8 inline-block mr-2"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
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

export function PageContainer({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Pinstriped band, per design-plan.md §5 — stripes live on header
          surfaces only, never behind body text. */}
      <header className="border-b-2 border-primary/30 bg-card bg-pinstripe">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center">
            <BaseballCornIcon />
            <h1 className="font-display text-xl text-primary sm:text-2xl">
              Youth Baseball Team Manager
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
