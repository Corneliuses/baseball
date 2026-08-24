import { describe, expect, it } from "vitest";

import { buildAnnouncementReceiptEmail } from "./announcement-receipt-email";

const ENV = { AUTH_URL: "https://app.example.com" };

function build(
  overrides: Partial<Parameters<typeof buildAnnouncementReceiptEmail>[0]> = {},
) {
  return buildAnnouncementReceiptEmail({
    teamName: "Sharks",
    teamId: "team-1",
    headline: "Game vs Hawks",
    dateTimeLabel: "Wed, Jul 15, 2026 at 5:30 PM",
    sent: 24,
    failed: 0,
    skipped: 0,
    env: ENV,
    ...overrides,
  });
}

describe("buildAnnouncementReceiptEmail — a clean run", () => {
  it("reports the count and nothing else", () => {
    const { subject, summary, needsAttention } = build();

    expect(subject).toBe("[Sharks] Game vs Hawks announced to 24 parents");
    expect(summary).toBe(
      "Game vs Hawks on Wed, Jul 15, 2026 at 5:30 PM went to 24 parents.",
    );
    expect(needsAttention).toBe(false);
  });

  it("says parent, singular, for a one-household team", () => {
    expect(build({ sent: 1 }).subject).toBe(
      "[Sharks] Game vs Hawks announced to 1 parent",
    );
  });
});

// The run that matters. A coach skimming a phone has to see the number that
// needs acting on, not a reassurance with a caveat buried in it.
describe("buildAnnouncementReceiptEmail — a run that needs attention", () => {
  it("leads with how many were missed, not how many went", () => {
    const { subject, summary, needsAttention } = build({ sent: 21, failed: 3 });

    expect(subject).toBe("[Sharks] 3 parents not told about Game vs Hawks");
    expect(summary).toContain("went to 21 parents");
    expect(summary).toContain("3 could not be reached");
    expect(needsAttention).toBe(true);
  });

  it("counts a family past the cap as unreached, not as a clean run", () => {
    const { subject, needsAttention } = build({ sent: 200, skipped: 4 });

    expect(subject).toBe("[Sharks] 4 parents not told about Game vs Hawks");
    expect(needsAttention).toBe(true);
  });

  it("adds failures and skips together", () => {
    expect(build({ sent: 10, failed: 2, skipped: 3 }).subject).toBe(
      "[Sharks] 5 parents not told about Game vs Hawks",
    );
  });

  it("says parent, singular, for a single miss", () => {
    expect(build({ sent: 23, failed: 1 }).subject).toBe(
      "[Sharks] 1 parent not told about Game vs Hawks",
    );
  });
});

describe("buildAnnouncementReceiptEmail — the link", () => {
  // The schedule, not the event: a coach acting on this is chasing families.
  it("points at the schedule", () => {
    expect(build().scheduleUrl).toBe("https://app.example.com/t/team-1/schedule");
  });
});
