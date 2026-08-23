import { describe, expect, it } from "vitest";

import { buildEventAnnouncementEmail } from "./event-announcement-email";

const ENV = { AUTH_URL: "https://app.example.com" };

// 5:30 PM Central on 15 July 2026 — 22:30Z, i.e. the same calendar day in both
// zones, so a broken implementation fails on the *time*, not the date.
const AFTERNOON = new Date("2026-07-15T22:30:00Z");
// 7:30 PM Central on 15 July — 00:30Z on the *16th*. This is the one that
// matters: a UTC-formatted announcement tells a parent the wrong day, and the
// test process runs TZ=UTC exactly like Vercel does.
const EVENING = new Date("2026-07-16T00:30:00Z");

function build(
  overrides: Partial<Parameters<typeof buildEventAnnouncementEmail>[0]> = {},
) {
  return buildEventAnnouncementEmail({
    teamName: "Sharks",
    teamId: "team-1",
    eventId: "evt-1",
    type: "GAME",
    startsAt: AFTERNOON,
    opponent: "Hawks",
    env: ENV,
    ...overrides,
  });
}

describe("buildEventAnnouncementEmail — the subject", () => {
  it("leads with the team, says what is new, and carries the full date", () => {
    expect(build().subject).toBe(
      "[Sharks] New game: Wed, Jul 15, 2026 at 5:30 PM vs Hawks",
    );
  });

  it("says practice for a practice", () => {
    expect(build({ type: "PRACTICE", opponent: null }).subject).toBe(
      "[Sharks] New practice: Wed, Jul 15, 2026 at 5:30 PM",
    );
  });

  it("drops the opponent clause for a game with no opponent recorded", () => {
    expect(build({ opponent: null }).subject).toBe(
      "[Sharks] New game: Wed, Jul 15, 2026 at 5:30 PM",
    );
  });

  it("never names an opponent on a practice, even if the column holds one", () => {
    expect(build({ type: "PRACTICE", opponent: "Hawks" }).subject).not.toContain(
      "Hawks",
    );
  });

  it("ignores a whitespace-only opponent", () => {
    expect(build({ opponent: "   " }).subject).toBe(
      "[Sharks] New game: Wed, Jul 15, 2026 at 5:30 PM",
    );
  });
});

// The recurring bug this whole app guards against: a late-evening Central
// event is already tomorrow in UTC, and the server formatting it runs TZ=UTC.
describe("buildEventAnnouncementEmail — APP_TIMEZONE", () => {
  it("formats a late-evening event on its Central day, not the UTC one", () => {
    const { subject, dateTimeLabel } = build({ startsAt: EVENING });

    expect(dateTimeLabel).toBe("Wed, Jul 15, 2026 at 7:30 PM");
    expect(subject).toContain("Jul 15");
    // What a UTC-formatted implementation would have said.
    expect(subject).not.toContain("Jul 16");
    expect(subject).not.toContain("12:30 AM");
  });
});

describe("buildEventAnnouncementEmail — the link", () => {
  it("points at the event page, where the RSVP buttons are", () => {
    expect(build().eventUrl).toBe(
      "https://app.example.com/t/team-1/schedule/evt-1",
    );
  });

  it("shares one headline with the heading inside the email", () => {
    const { headline, subject } = build();

    expect(headline).toBe("Game vs Hawks");
    expect(subject).toContain("vs Hawks");
  });

  it("uses the reminder's practice headline unchanged", () => {
    expect(build({ type: "PRACTICE", opponent: null }).headline).toBe("Practice");
  });
});
