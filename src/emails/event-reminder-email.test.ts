import { describe, expect, it } from "vitest";

import {
  buildEventReminderEmail,
  rsvpReminderLabel,
} from "./event-reminder-email";

const ENV = { AUTH_URL: "https://app.example.com" };

// 5:30 PM Central on 15 July 2026 — 22:30Z, i.e. the same calendar day in
// both zones, so a broken implementation fails on the *time*, not the date.
const AFTERNOON = new Date("2026-07-15T22:30:00Z");
// 7:30 PM Central on 15 July — 00:30Z on the 16th. A UTC-formatted subject
// says 12:30 AM here, which is the bug worth pinning.
const EVENING = new Date("2026-07-16T00:30:00Z");

function build(overrides: Partial<Parameters<typeof buildEventReminderEmail>[0]> = {}) {
  return buildEventReminderEmail({
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

describe("buildEventReminderEmail", () => {
  it("leads with the team name and says today", () => {
    expect(build().subject).toBe("[Sharks] Today: Game vs Hawks, 5:30 PM");
  });

  it("formats the time in APP_TIMEZONE, not UTC", () => {
    const { subject, timeLabel } = build({ startsAt: EVENING });

    expect(timeLabel).toBe("7:30 PM");
    expect(subject).toContain("7:30 PM");
    expect(subject).not.toContain("12:30 AM");
  });

  it("names a practice as a practice, with no opponent", () => {
    const { subject, headline } = build({ type: "PRACTICE", opponent: null });

    expect(headline).toBe("Practice");
    expect(subject).toBe("[Sharks] Today: Practice, 5:30 PM");
  });

  it("ignores an opponent on a practice", () => {
    expect(build({ type: "PRACTICE", opponent: "Hawks" }).headline).toBe(
      "Practice",
    );
  });

  it("falls back to a bare Game when no opponent is recorded", () => {
    expect(build({ opponent: null }).headline).toBe("Game");
    expect(build({ opponent: "   " }).headline).toBe("Game");
  });

  it("trims a padded opponent name", () => {
    expect(build({ opponent: "  Hawks  " }).headline).toBe("Game vs Hawks");
  });

  it("links to the event page, where the RSVP buttons are", () => {
    expect(build().eventUrl).toBe(
      "https://app.example.com/t/team-1/schedule/evt-1",
    );
  });

  it("uses the same headline in the subject as in the body", () => {
    const { subject, headline } = build();
    expect(subject).toContain(headline);
  });
});

describe("rsvpReminderLabel", () => {
  it("reads back the family's own answer", () => {
    expect(rsvpReminderLabel("Jimmy", "attending")).toBe("Jimmy — you said yes");
    expect(rsvpReminderLabel("Jimmy", "declined")).toBe("Jimmy — you said no");
  });

  it("invites an answer when there is none", () => {
    expect(rsvpReminderLabel("Jimmy", "no-response")).toBe(
      "Jimmy — no answer yet",
    );
  });
});
