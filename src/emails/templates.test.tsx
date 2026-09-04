import type { ReactElement } from "react";
import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";

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
 * So this checks the three things that would otherwise be found in an inbox:
 *
 * 1. **Every template renders and still carries its facts** — the team name,
 *    the date, the code, the link.
 * 2. **The banana budget** (design-plan.md §2). At most one Banana Yellow
 *    surface per email, and the calm emails have none.
 * 3. **The link survives a client that strips links.** Every template with a
 *    button repeats its URL as plain text.
 */

const TEAM = "Cornelius 7/8 Baseball";

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
  /// Text that has to survive, whatever the styling does.
  contains: string[];
}[] = [
  {
    name: "InvitationEmail",
    element: (
      <InvitationEmail
        teamName={TEAM}
        acceptUrl="https://baseball.example.com/invite/tok123"
        expiresAt={new Date("2026-09-20T12:00:00Z")}
        message={"Practice moves indoors if it rains.\nSee you Saturday."}
      />
    ),
    banana: true,
    contains: [
      TEAM,
      "https://baseball.example.com/invite/tok123",
      "September 20, 2026",
      "See you Saturday.",
    ],
  },
  {
    name: "AddedToTeamEmail",
    element: (
      <AddedToTeamEmail
        teamName={TEAM}
        teamUrl="https://baseball.example.com/t/team-1"
      />
    ),
    banana: true,
    contains: [TEAM, "https://baseball.example.com/t/team-1"],
  },
  {
    name: "SignInCodeEmail",
    element: <SignInCodeEmail formattedCode="K3M7-QP2X" expiresMinutes={10} />,
    // The code panel is a scoreboard, and floodlight yellow on charcoal is the
    // banana family after dark. There is no button to spend a yellow surface
    // on, which is the whole design of this email.
    banana: false,
    contains: ["K3M7-QP2X", "10 minutes"],
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
        eventUrl="https://baseball.example.com/t/team-1/schedule/ev-1"
      />
    ),
    banana: true,
    contains: [
      TEAM,
      "Game vs Robert",
      "Wed, Sep 16, 2026 at 5:45 PM",
      "Lakeview Playground - Field 5",
      "https://baseball.example.com/t/team-1/schedule/ev-1",
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
        scheduleUrl="https://baseball.example.com/t/team-1/schedule"
      />
    ),
    banana: true,
    contains: [
      "3 games vs Hawks",
      "Sat, Apr 4, 2026 at 5:30 PM",
      "Sat, Apr 18, 2026 at 5:30 PM",
      "Bring both jerseys.",
      "https://baseball.example.com/t/team-1/schedule",
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
        eventUrl="https://baseball.example.com/t/team-1/schedule/ev-1"
      />
    ),
    banana: true,
    contains: [
      "Game vs Hawks",
      "5:45 PM",
      // rsvpReminderLabel's sentences, which are what carry each state in
      // words rather than in colour.
      "Ava — you said yes",
      "Sam — no answer yet",
      "https://baseball.example.com/t/team-1/schedule/ev-1",
    ],
  },
  {
    name: "TeamMessageEmail",
    element: (
      <TeamMessageEmail
        teamName={TEAM}
        senderName="Coach Cornelius"
        body={"Fields are wet.\n\nWe'll decide by 4."}
        teamUrl="https://baseball.example.com/t/team-1"
      />
    ),
    banana: false,
    contains: ["Coach Cornelius", "Fields are wet.", "We'll decide by 4."],
  },
  {
    name: "AnnouncementReceiptEmail",
    element: (
      <AnnouncementReceiptEmail
        summary="Game vs Hawks on Sat, Apr 4, 2026 at 5:30 PM went to 12 parents."
        needsAttention={false}
        scheduleUrl="https://baseball.example.com/t/team-1/schedule"
      />
    ),
    banana: false,
    contains: ["went to 12 parents", "Announcement sent"],
  },
];

/// The rendered markup, with the two entities React escapes decoded again.
/// The assertions below are about what a parent reads, and "We&#x27;ll decide
/// by 4." is the same sentence as the one the coach typed — a test that made
/// every apostrophe in this file an escape sequence would be testing React's
/// escaping, not the email.
async function html(element: ReactElement): Promise<string> {
  const markup = await render(element);
  return markup.replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

/// Occurrences of a colour used as a *background*, which is what "a banana
/// surface" means. Deliberately not a count of the hex anywhere: the button
/// also draws a navy keyline, and a state colour appears as a border on rows
/// that are not surfaces at all.
function backgrounds(markup: string, color: string): number {
  return markup.split(`background-color:${color}`).length - 1;
}

describe.each(TEMPLATES)("$name", ({ element, banana, contains }) => {
  it("renders the facts it exists to deliver", async () => {
    const markup = await html(element);

    for (const fragment of contains) {
      expect(markup).toContain(fragment);
    }
  });

  it("wears the shell", async () => {
    const markup = await html(element);

    // Cream page, warm card, charcoal cap: the three surfaces that make an
    // email from this app recognisable at a glance.
    expect(backgrounds(markup, EMAIL_COLOR.page)).toBeGreaterThanOrEqual(1);
    expect(backgrounds(markup, EMAIL_COLOR.card)).toBe(1);
    expect(backgrounds(markup, EMAIL_COLOR.scoreboard)).toBeGreaterThanOrEqual(
      1,
    );
    expect(markup).toContain("Youth Baseball Team Manager");
    // Auto-inversion turns cream and navy to mud; this is the only lever that
    // asks a client not to.
    expect(markup).toContain('name="color-scheme"');
  });

  it("spends at most one banana, and none where the plan says none", async () => {
    const markup = await html(element);

    expect(backgrounds(markup, EMAIL_COLOR.banana)).toBe(banana ? 1 : 0);
  });

  it("never puts white on the banana, or anywhere else", async () => {
    const markup = await html(element);

    // design-plan.md §3 ends on "Banana Yellow never carries white text,
    // ever." The palette has no white in it at all — the lightest surface is
    // warm card stock — so any pure white here is a hand-written colour that
    // skipped `brand.ts`, which is exactly how the yellow-and-white pairing
    // would arrive.
    expect(markup.toUpperCase()).not.toContain("#FFFFFF");
    expect(markup).not.toContain("#fff;");
  });
});

describe("links", () => {
  it.each(
    TEMPLATES.filter(({ banana }) => banana).map(({ name, element, contains }) => ({
      name,
      element,
      url: contains.find((fragment) => fragment.startsWith("https://"))!,
    })),
  )(
    "$name repeats its URL as text for clients that strip links",
    async ({ element, url }) => {
      const markup = await html(element);

      // Once in the href, once in the body copy. Corporate gateways rewrite
      // links and some clients strip them outright; a parent who cannot tap
      // has to be able to copy.
      expect(markup.split(url).length - 1).toBeGreaterThanOrEqual(2);
    },
  );
});
