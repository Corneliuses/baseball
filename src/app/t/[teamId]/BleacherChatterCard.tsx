"use client";

import { useState, useSyncExternalStore } from "react";

import { CheckIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

/// One key per team: a family on two teams joins two chats, and "joined" on
/// the Sharks must not silence the Sluggers' card. Local to this browser on
/// purpose — GroupMe owns actual membership and never tells us, so the honest
/// thing to remember is only "this phone tapped join here".
function joinedKey(teamId: string): string {
  return `ybtm:groupme-joined:${teamId}`;
}

/// Reading localStorage throws outright in a Safari private window, so every
/// access is guarded — same posture as InstallPrompt. A browser that will not
/// answer is treated as "not joined": worst case the full card shows again,
/// and the full card still carries the link.
function wasJoined(teamId: string): boolean {
  try {
    return window.localStorage.getItem(joinedKey(teamId)) === "1";
  } catch {
    return false;
  }
}

function rememberJoined(teamId: string): void {
  try {
    window.localStorage.setItem(joinedKey(teamId), "1");
  } catch {
    // A phone that cannot remember still collapsed the card for this visit.
  }
}

/// "Has this rendered on a real browser yet" — the InstallPrompt pattern,
/// for the same reason: the joined flag exists only on the client, so the
/// server render and the first client render must agree (on the full card)
/// or hydration mismatches. useSyncExternalStore rather than a
/// state-flipping effect, per the React Compiler lint.
const subscribeToNothing = () => () => {};
const hydratedOnClient = () => true;
const hydratedOnServer = () => false;

/// The stands, drawn in the app's felt-and-cardstock register: three bench
/// rows of fans in the team palette, one of them mid-chatter. Fills are the
/// theme tokens, so a night game (dark mode) seats the same crowd under
/// floodlights. Decorative only — aria-hidden, like FieldArt and every glyph
/// in icons.tsx; the card's text is where the facts live.
///
/// The strip is a fixed 88px tall and the composition is 1280 units wide —
/// as wide as the layout's max-w-7xl column can ever make the card — with
/// `slice` cropping the wings symmetrically. A wider card therefore sees
/// MORE stands, never taller ones: proportional scaling drew a 275px crowd
/// on a desktop, and a plain max-width on the art left the planks stopping
/// mid-card. The essential scene (the speech bubble and the fans around it)
/// lives in the middle 390 units, so a phone shows exactly the frame this
/// card was composed at; only bonus fans are ever cropped.
function BleacherArt() {
  return (
    <svg
      viewBox="0 0 1280 88"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className="block h-[88px] w-full"
    >
      {/* Back row — fans first, then the plank overlaps their laps. */}
      <rect x="51" y="16" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="60" cy="10" r="6" className="fill-destructive" />
      <rect x="161" y="16" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="170" cy="10" r="6" className="fill-foreground" />
      <rect x="291" y="16" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="300" cy="10" r="6" className="fill-primary" />
      <rect x="401" y="16" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="410" cy="10" r="6" className="fill-foreground" />
      <rect x="510" y="16" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="519" cy="10" r="6" className="fill-primary" />
      <rect x="629" y="16" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="638" cy="10" r="6" className="fill-foreground" />
      <rect x="736" y="16" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="745" cy="10" r="6" className="fill-destructive" />
      <rect x="871" y="16" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="880" cy="10" r="6" className="fill-primary" />
      <rect x="981" y="16" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="990" cy="10" r="6" className="fill-destructive" />
      <rect x="1101" y="16" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="1110" cy="10" r="6" className="fill-foreground" />
      <rect x="1211" y="16" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="1220" cy="10" r="6" className="fill-primary" />
      <rect x="-8" y="28" width="1296" height="8" rx="2" className="fill-dirt" />
      <rect x="-8" y="36" width="1296" height="3" className="fill-foreground/15" />

      {/* Middle row, with the chatter itself. */}
      <rect x="101" y="40" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="110" cy="34" r="6" className="fill-primary" />
      <rect x="221" y="40" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="230" cy="34" r="6" className="fill-foreground" />
      <rect x="351" y="40" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="360" cy="34" r="6" className="fill-destructive" />
      <rect x="563" y="40" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="572" cy="34" r="6" className="fill-destructive" />
      <rect x="677" y="40" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="686" cy="34" r="6" className="fill-primary" />
      <rect x="783" y="40" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="792" cy="34" r="6" className="fill-foreground" />
      <rect x="866" y="40" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="875" cy="34" r="6" className="fill-foreground" />
      <rect x="991" y="40" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="1000" cy="34" r="6" className="fill-primary" />
      <rect x="1121" y="40" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="1130" cy="34" r="6" className="fill-destructive" />
      <rect x="1226" y="40" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="1235" cy="34" r="6" className="fill-foreground" />
      <path
        d="M704 24 L695 31 L710 26 Z"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="fill-card stroke-foreground"
      />
      <rect
        x="698"
        y="6"
        width="36"
        height="19"
        rx="7"
        strokeWidth="1.5"
        className="fill-card stroke-foreground"
      />
      <circle cx="707" cy="15.5" r="1.7" className="fill-foreground" />
      <circle cx="716" cy="15.5" r="1.7" className="fill-foreground" />
      <circle cx="725" cy="15.5" r="1.7" className="fill-foreground" />
      <rect x="-8" y="52" width="1296" height="8" rx="2" className="fill-dirt" />
      <rect x="-8" y="60" width="1296" height="3" className="fill-foreground/15" />

      {/* Front row. */}
      <rect x="141" y="64" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="150" cy="58" r="6" className="fill-destructive" />
      <rect x="321" y="64" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="330" cy="58" r="6" className="fill-primary" />
      <rect x="496" y="64" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="505" cy="58" r="6" className="fill-foreground" />
      <rect x="702" y="64" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="711" cy="58" r="6" className="fill-destructive" />
      <rect x="891" y="64" width="18" height="13" rx="6" className="fill-primary" />
      <circle cx="900" cy="58" r="6" className="fill-primary" />
      <rect x="1071" y="64" width="18" height="13" rx="6" className="fill-foreground" />
      <circle cx="1080" cy="58" r="6" className="fill-foreground" />
      <rect x="1201" y="64" width="18" height="13" rx="6" className="fill-destructive" />
      <circle cx="1210" cy="58" r="6" className="fill-destructive" />
      <rect x="-8" y="76" width="1296" height="8" rx="2" className="fill-dirt" />
      <rect x="-8" y="84" width="1296" height="3" className="fill-foreground/15" />
    </svg>
  );
}

/// You're leaving the app for GroupMe — the one glyph this card draws that
/// icons.tsx doesn't already have. Local like team home's StarGlyph, same
/// contract: aria-hidden, currentColor, the set's 1.75 stroke on a 24 grid.
function ArrowGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

/**
 * The team's GroupMe invite, presented as the stands — the one place at a
 * ballgame that belongs to the families, which is exactly who this link is
 * for. Rendered by team home only when the owner has shared a link in
 * settings (`Team.groupMeUrl`), for every role: coaches sit in the chat too.
 *
 * Joining is a once-per-family act and the dashboard is a forever page, so
 * the card has a lifecycle: after this browser taps join, it collapses to a
 * one-line "you're in" row that keeps the link and stops re-pitching. That
 * memory is a per-viewer convenience, not state — localStorage, per team,
 * guarded like InstallPrompt's — because GroupMe never tells us who actually
 * joined.
 *
 * Deliberately no banana anywhere on it: team home's yellow belongs to the
 * kids' marquee strips (design-plan.md §2), and this card's fun budget is
 * spent on the crowd instead.
 */
export function BleacherChatterCard({
  teamId,
  groupMeUrl,
}: {
  teamId: string;
  groupMeUrl: string;
}) {
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    hydratedOnClient,
    hydratedOnServer,
  );
  const [joinedThisVisit, setJoinedThisVisit] = useState(false);

  const joined = joinedThisVisit || (hydrated && wasJoined(teamId));

  const join = () => {
    rememberJoined(teamId);
    setJoinedThisVisit(true);
  };

  if (joined) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm">
        <CheckIcon className="size-4 shrink-0 text-primary" />
        <span className="flex-1 text-foreground">You&rsquo;re in the stands.</span>
        <a
          href={groupMeUrl}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-primary"
        >
          Open GroupMe
        </a>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* The sky above the stands is a hero surface, which is where §5 says
          pinstripes may go. */}
      <div className="border-b border-border bg-pinstripe">
        <BleacherArt />
      </div>
      <div className="space-y-2 px-6 pb-6 pt-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Team chat · GroupMe
        </p>
        <CardTitle>Bleacher chatter</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Where the families sit. Carpools, rain calls, and cheering between
          Saturdays — the team&rsquo;s group chat on GroupMe.
        </p>
        <div className="pt-2">
          <Button asChild size="sm">
            <a
              href={groupMeUrl}
              target="_blank"
              rel="noreferrer"
              onClick={join}
              aria-label="Join the chatter — the team's group chat on GroupMe"
            >
              Join the chatter
              <ArrowGlyph />
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
