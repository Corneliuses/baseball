import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { beforeAll, describe, expect, it } from "vitest";

import { EMAIL_COLOR } from "./brand";
import { AddedToTeamEmail } from "./AddedToTeamEmail";
import { AnnouncementReceiptEmail } from "./AnnouncementReceiptEmail";
import { EventAnnouncementEmail } from "./EventAnnouncementEmail";
import { EventReminderEmail } from "./EventReminderEmail";
import { EventsAnnouncementEmail } from "./EventsAnnouncementEmail";
import { InvitationEmail } from "./InvitationEmail";
import { SignInCodeEmail } from "./SignInCodeEmail";
import { TeamMessageEmail } from "./TeamMessageEmail";

/**
 * Every template, actually rendered.
 *
 * Nothing else in the suite renders these: the builders next door are pure and
 * well covered, and the markup they feed was previously simple enough to read.
 * It is not any more — the eight templates now share a shell, a palette and a
 * texture kit — and the failure mode of shared email markup is silent. A
 * template that stops rendering, loses its URL, or quietly spends a second
 * banana still returns a string, still sends, and is only ever seen by the
 * families it was sent to.
 *
 * So this checks the four things that would otherwise be found in an inbox:
 *
 * 1. **Every template renders and still carries its facts** — the team name
 *    on the cap, the date, the code, the link.
 * 2. **The banana budget** (design-plan.md §2). At most one banana surface per
 *    email, counted by the `data-banana` marker the two permitted components
 *    carry, and none at all on the calm emails.
 * 3. **Every colour comes from the palette.** No hand-typed hex, no React
 *    Email default leaking through, and therefore no white anywhere — which is
 *    how "white on the banana" would arrive.
 * 4. **The link survives a client that strips links.** Every template with a
 *    URL repeats it as plain text.
 */

const TEAM = "Cornelius 7/8 Baseball";
const URL = "https://baseball.example.com";

/// The eight templates with realistic props, including the awkward ones: a
/// team name with a slash, an event with no location, and a family with two
/// kids in different RSVP states.
const TEMPLATES: {
  name: string;
  element: ReactElement;
  /// Whether design-plan.md §2's one banana is spent in this email. The calm
  /// ones (`false`) are a claim, not an oversight — see each template's own
  /// comment.
  banana: boolean;
  /// The URL the template links to, if any — asserted to appear as text.
  url: string | null;
  /// Text that has to survive, whatever the styling does.
  contains: string[];
}[] = [
  {
    name: "InvitationEmail",
    element: (
      <InvitationEmail
        teamName={TEAM}
        acceptUrl={`${URL}/invite/tok123`}
        expiresAt={new Date("2026-09-20T12:00:00Z")}
        message={"Practice moves indoors if it rains.\nSee you Saturday."}
      />
    ),
    banana: true,
    url: `${URL}/invite/tok123`,
    contains: [TEAM, "September 20, 2026", "See you Saturday."],
  },
  {
    name: "AddedToTeamEmail",
    element: <AddedToTeamEmail teamName={TEAM} teamUrl={`${URL}/t/team-1`} />,
    banana: true,
    url: `${URL}/t/team-1`,
    contains: [TEAM],
  },
  {
    name: "SignInCodeEmail",
    element: <SignInCodeEmail formattedCode="K3M7-QP2X" expiresMinutes={10} />,
    // The code panel is a scoreboard, and floodlight yellow on charcoal is the
    // banana family after dark. There is no button, by design; the panel is
    // the banana.
    banana: true,
    url: null,
    contains: ["K3M7-QP2X", "expires in 10 minutes"],
  },
  {
    name: "EventAnnouncementEmail",
    element: (
      <EventAnnouncementEmail
        teamName={TEAM}
        headline="Game vs Robert"
        dateTimeLabel="Wed, Sep 16, 2026 at 5:45 PM"
        location="Lakeview Playground - Field 5"
        notes={null}
        eventUrl={`${URL}/t/team-1/schedule/ev-1`}
      />
    ),
    banana: true,
    url: `${URL}/t/team-1/schedule/ev-1`,
    contains: [
      "Game vs Robert",
      "Wed, Sep 16, 2026 at 5:45 PM",
      "Lakeview Playground - Field 5",
    ],
  },
  {
    name: "EventsAnnouncementEmail",
    element: (
      <EventsAnnouncementEmail
        teamName={TEAM}
        headline="3 games vs Hawks"
        dateTimeLabels={[
          "Sat, Apr 4, 2026 at 5:30 PM",
          "Sat, Apr 11, 2026 at 5:30 PM",
          "Sat, Apr 18, 2026 at 5:30 PM",
        ]}
        location={null}
        notes="Bring both jerseys."
        scheduleUrl={`${URL}/t/team-1/schedule`}
      />
    ),
    banana: true,
    url: `${URL}/t/team-1/schedule`,
    contains: [
      "3 games vs Hawks",
      "Sat, Apr 4, 2026 at 5:30 PM",
      "Sat, Apr 18, 2026 at 5:30 PM",
      "Bring both jerseys.",
    ],
  },
  {
    name: "EventReminderEmail",
    element: (
      <EventReminderEmail
        teamName={TEAM}
        headline="Game vs Hawks"
        timeLabel="5:45 PM"
        location="Lakeview Playground - Field 5"
        notes={null}
        kids={[
          { playerId: "p1", name: "Ava", rsvp: "attending" },
          { playerId: "p2", name: "Sam", rsvp: "no-response" },
        ]}
        eventUrl={`${URL}/t/team-1/schedule/ev-1`}
      />
    ),
    banana: true,
    url: `${URL}/t/team-1/schedule/ev-1`,
    contains: [
      "Game vs Hawks",
      "5:45 PM",
      // rsvpReminderLabel's sentences, which are what carry each state in
      // words rather than in colour.
      "Ava — you said yes",
      "Sam — no answer yet",
    ],
  },
  {
    name: "TeamMessageEmail",
    element: (
      <TeamMessageEmail
        teamName={TEAM}
        senderName="Coach Cornelius"
        body={"Fields are wet.\n\nWe'll decide by 4."}
        teamUrl={`${URL}/t/team-1`}
      />
    ),
    banana: false,
    url: `${URL}/t/team-1`,
    contains: ["Coach Cornelius", "Fields are wet.", "We'll decide by 4."],
  },
  {
    name: "AnnouncementReceiptEmail",
    element: (
      <AnnouncementReceiptEmail
        teamName={TEAM}
        summary="Game vs Hawks on Sat, Apr 4, 2026 at 5:30 PM went to 12 parents."
        needsAttention={false}
        scheduleUrl={`${URL}/t/team-1/schedule`}
      />
    ),
    banana: false,
    url: `${URL}/t/team-1/schedule`,
    contains: ["went to 12 parents", "Announcement sent"],
  },
];

/// Rendered once per template, with the one entity React escapes in this copy
/// decoded again: the assertions are about what a parent reads, and "We&#x27;ll
/// decide by 4." is the same sentence as the one the coach typed.
const rendered = new Map<string, string>();

beforeAll(async () => {
  for (const { name, element } of TEMPLATES) {
    const markup = await render(element);
    rendered.set(name, markup.replaceAll("&#x27;", "'"));
  }
});

function markupOf(name: string): string {
  const markup = rendered.get(name);
  if (!markup) {
    throw new Error(`${name} was not rendered`);
  }
  return markup;
}

/// Every `#hex` colour the markup paints with. `&#8202;`-style entities are
/// not colours and are skipped; everything else has to be in the palette.
function paintedColors(markup: string): string[] {
  return [...markup.matchAll(/(?<!&)#[0-9a-fA-F]{3,8}\b/g)].map((m) =>
    m[0].toUpperCase(),
  );
}

describe.each(TEMPLATES)("$name", ({ name, banana, url, contains }) => {
  it("renders the facts it exists to deliver", () => {
    const markup = markupOf(name);

    for (const fragment of contains) {
      expect(markup).toContain(fragment);
    }
  });

  it("wears the shell", () => {
    const markup = markupOf(name);

    // Cream page, warm card, charcoal cap: the three surfaces that make an
    // email from this app recognisable at a glance.
    expect(markup).toContain(`background-color:${EMAIL_COLOR.page}`);
    expect(markup).toContain(`background-color:${EMAIL_COLOR.card}`);
    expect(markup).toContain(`background-color:${EMAIL_COLOR.scoreboard}`);
    expect(markup).toContain("Youth Baseball Team Manager");
  });

  it("names the team on the cap, unless it is the pre-team sign-in code", () => {
    const markup = markupOf(name);
    const capCount = markup.split(TEAM).length - 1;

    if (name === "SignInCodeEmail") {
      expect(capCount).toBe(0);
    } else {
      // At least on the cap; most templates also say it in the body.
      expect(capCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("spends at most one banana, and none where the plan says none", () => {
    const markup = markupOf(name);

    expect(markup.split("data-banana=").length - 1).toBe(banana ? 1 : 0);
  });

  it("paints only palette colours", () => {
    // design-plan.md §3 ends on "Banana Yellow never carries white text,
    // ever." The palette has no white in it at all — the lightest surface is
    // warm card stock — so the general check subsumes that one: any colour
    // not in EMAIL_COLOR is a hand-typed hex that skipped brand.ts, or a
    // React Email default (its Hr is #eaeaea) leaking through an override
    // that stopped overriding.
    const palette = new Set<string>(Object.values(EMAIL_COLOR));
    const offPalette = paintedColors(markupOf(name)).filter(
      (color) => !palette.has(color),
    );

    expect(offPalette).toEqual([]);
    expect(markupOf(name)).not.toMatch(/color:\s*white\b/i);
  });

  it("repeats its URL as text for clients that strip links", () => {
    if (url === null) {
      // The sign-in code is deliberately link-free — see its docstring.
      expect(markupOf(name)).not.toContain("href=");
      return;
    }

    // Once in the href, once in the body copy. Corporate gateways rewrite
    // links and some clients strip them outright; a parent who cannot tap
    // has to be able to copy.
    expect(markupOf(name).split(url).length - 1).toBeGreaterThanOrEqual(2);
  });
});
