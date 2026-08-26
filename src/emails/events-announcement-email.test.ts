import { describe, expect, it } from "vitest";

import { buildEventsAnnouncementEmail } from "./events-announcement-email";

const ENV = { AUTH_URL: "https://app.example.com" };

/// 5:30 PM Central on four consecutive Saturdays in spring 2026 — 22:30Z, i.e.
/// the same calendar day in both zones, so a broken implementation fails on the
/// *time* rather than the date.
const SATURDAYS = [
  new Date("2026-04-04T22:30:00Z"),
  new Date("2026-04-11T22:30:00Z"),
  new Date("2026-04-18T22:30:00Z"),
  new Date("2026-04-25T22:30:00Z"),
];

/// 7:30 PM Central on 15 July — 00:30Z on the *16th*. The one that matters: a
/// UTC-formatted announcement tells a parent the wrong day, and the test
/// process runs TZ=UTC exactly like Vercel does.
const EVENING = new Date("2026-07-16T00:30:00Z");

function build(
  overrides: Partial<Parameters<typeof buildEventsAnnouncementEmail>[0]> = {},
) {
  return buildEventsAnnouncementEmail({
    teamName: "Sharks",
    teamId: "team-1",
    type: "GAME",
    startsAts: SATURDAYS,
    opponent: "Hawks",
    env: ENV,
    ...overrides,
  });
}

describe("buildEventsAnnouncementEmail — the subject", () => {
  it("leads with the team and the count, then the span", () => {
    expect(build().subject).toBe(
      "[Sharks] 4 games vs Hawks: Sat, Apr 4 – Sat, Apr 25",
    );
  });

  it("says practices for practices", () => {
    expect(build({ type: "PRACTICE", opponent: null }).subject).toBe(
      "[Sharks] 4 practices: Sat, Apr 4 – Sat, Apr 25",
    );
  });

  it("drops the opponent clause for games with no opponent recorded", () => {
    expect(build({ opponent: null }).subject).toBe(
      "[Sharks] 4 games: Sat, Apr 4 – Sat, Apr 25",
    );
  });

  it("never names an opponent on practices, even if the column holds one", () => {
    expect(
      build({ type: "PRACTICE", opponent: "Hawks" }).subject,
    ).not.toContain("Hawks");
  });

  it("ignores a whitespace-only opponent", () => {
    expect(build({ opponent: "   " }).subject).toBe(
      "[Sharks] 4 games: Sat, Apr 4 – Sat, Apr 25",
    );
  });
});

describe("buildEventsAnnouncementEmail — the headline", () => {
  it("shares one headline with the heading inside the email", () => {
    const { headline, subject } = build();

    expect(headline).toBe("4 games vs Hawks");
    expect(subject).toContain(headline);
  });

  // The batch path never runs at one, but a count-dependent noun that is wrong
  // at 1 is exactly what surfaces later from a caller this module never saw.
  it("stays singular for a run of one", () => {
    expect(build({ startsAts: [SATURDAYS[0]] }).headline).toBe("1 game vs Hawks");
    expect(
      build({ startsAts: [SATURDAYS[0]], type: "PRACTICE", opponent: null })
        .headline,
    ).toBe("1 practice");
  });
});

describe("buildEventsAnnouncementEmail — the dates", () => {
  it("lists every occurrence in full, in order", () => {
    expect(build().dateTimeLabels).toEqual([
      "Sat, Apr 4, 2026 at 5:30 PM",
      "Sat, Apr 11, 2026 at 5:30 PM",
      "Sat, Apr 18, 2026 at 5:30 PM",
      "Sat, Apr 25, 2026 at 5:30 PM",
    ]);
  });

  it("collapses the range to one date when the run is one long", () => {
    expect(build({ startsAts: [SATURDAYS[0]] }).dateRangeLabel).toBe(
      "Sat, Apr 4",
    );
  });

  // A run that crosses the March boundary keeps its wall clock, so the labels
  // must all read the same time even though the instants are 167 hours apart.
  it("prints one wall clock across a DST boundary", () => {
    const { dateTimeLabels } = build({
      startsAts: [
        new Date("2026-03-08T00:00:00Z"), // 6 PM CST, 7 Mar
        new Date("2026-03-14T23:00:00Z"), // 6 PM CDT, 14 Mar
      ],
    });

    expect(dateTimeLabels).toEqual([
      "Sat, Mar 7, 2026 at 6:00 PM",
      "Sat, Mar 14, 2026 at 6:00 PM",
    ]);
  });
});

// The recurring bug this whole app guards against: a late-evening Central
// event is already tomorrow in UTC, and the server formatting it runs TZ=UTC.
describe("buildEventsAnnouncementEmail — APP_TIMEZONE", () => {
  it("formats a late-evening run on its Central day, not the UTC one", () => {
    const { subject, dateTimeLabels, dateRangeLabel } = build({
      startsAts: [EVENING],
    });

    expect(dateTimeLabels).toEqual(["Wed, Jul 15, 2026 at 7:30 PM"]);
    expect(dateRangeLabel).toBe("Wed, Jul 15");
    // What a UTC-formatted implementation would have said.
    expect(subject).not.toContain("Jul 16");
    expect(subject).not.toContain("12:30 AM");
  });
});

describe("buildEventsAnnouncementEmail — the link", () => {
  it("points at the schedule, because a batch has no single event to answer", () => {
    expect(build().scheduleUrl).toBe(
      "https://app.example.com/t/team-1/schedule",
    );
  });
});
