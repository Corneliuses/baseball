import { describe, expect, it } from "vitest";

import {
  buildTeamCalendar,
  escapeText,
  eventSummary,
  EVENT_DURATION_MS,
  foldLine,
  formatUtc,
  type IcsEvent,
} from "./ics";

const NOW = new Date("2026-08-22T12:00:00Z");

const TEAM = { name: "Sharks", season: "2026" };

function gameAt(startsAt: string, overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    id: "evt-1",
    type: "GAME",
    startsAt: new Date(startsAt),
    location: null,
    opponent: null,
    notes: null,
    ...overrides,
  };
}

/// Unfold before asserting on content: folding is a wire concern, and these
/// tests should not break because a summary crossed the 75-octet line.
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

describe("formatUtc", () => {
  it("renders the RFC 5545 UTC form with a trailing Z", () => {
    expect(formatUtc(new Date("2026-04-01T19:30:00Z"))).toBe("20260401T193000Z");
  });

  it("truncates milliseconds", () => {
    expect(formatUtc(new Date("2026-04-01T19:30:00.500Z"))).toBe(
      "20260401T193000Z",
    );
  });
});

describe("escapeText", () => {
  it("escapes commas, semicolons, and backslashes", () => {
    expect(escapeText("Field 3, Riverside; C:\\path")).toBe(
      "Field 3\\, Riverside\\; C:\\\\path",
    );
  });

  it("escapes backslash first, not re-escaping its own output", () => {
    expect(escapeText("\\,")).toBe("\\\\\\,");
  });

  it("turns every newline flavour into a literal \\n", () => {
    expect(escapeText("bring\nwater\r\nand\rhats")).toBe(
      "bring\\nwater\\nand\\nhats",
    );
  });
});

describe("foldLine", () => {
  it("leaves a 75-octet line alone", () => {
    const line = "X".repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it("folds a longer line with CRLF plus a space, every segment within 75 octets", () => {
    const folded = foldLine("SUMMARY:" + "a".repeat(200));
    const segments = folded.split("\r\n");

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(new TextEncoder().encode(segment).length).toBeLessThanOrEqual(75);
    }
    for (const continuation of segments.slice(1)) {
      expect(continuation.startsWith(" ")).toBe(true);
    }
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "a".repeat(200));
  });

  it("never splits a multi-byte character", () => {
    const folded = foldLine("DESCRIPTION:" + "é".repeat(100));
    // A split-in-half é would not survive the round trip.
    expect(folded.replace(/\r\n /g, "")).toBe("DESCRIPTION:" + "é".repeat(100));
    for (const segment of folded.split("\r\n")) {
      expect(new TextEncoder().encode(segment).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("eventSummary", () => {
  it("names a game with its opponent", () => {
    expect(eventSummary({ type: "GAME", opponent: "Hawks" })).toBe(
      "Game vs Hawks",
    );
  });

  it("falls back to Game with no opponent", () => {
    expect(eventSummary({ type: "GAME", opponent: null })).toBe("Game");
  });

  it("ignores opponent on a practice", () => {
    expect(eventSummary({ type: "PRACTICE", opponent: "Hawks" })).toBe(
      "Practice",
    );
  });
});

describe("buildTeamCalendar", () => {
  it("renders a valid empty calendar for a team with no events", () => {
    const ics = buildTeamCalendar(TEAM, [], NOW);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("METHOD:PUBLISH");
  });

  it("names the calendar after team and season, and team alone without one", () => {
    expect(buildTeamCalendar(TEAM, [], NOW)).toContain(
      "X-WR-CALNAME:Sharks 2026",
    );
    expect(buildTeamCalendar({ name: "Sharks", season: null }, [], NOW)).toContain(
      "X-WR-CALNAME:Sharks",
    );
  });

  it("includes both refresh hints", () => {
    const ics = buildTeamCalendar(TEAM, [], NOW);
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT12H");
    expect(ics).toContain("X-PUBLISHED-TTL:PT12H");
  });

  it("uses CRLF line endings exclusively", () => {
    const ics = buildTeamCalendar(
      TEAM,
      [gameAt("2026-04-01T19:30:00Z", { notes: "bring water" })],
      NOW,
    );
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("renders DTSTART as the stored UTC instant — a late Central evening lands on the next UTC day", () => {
    // 8:00 PM CDT on 21 Aug 2026 — stored as 01:00Z on the 22nd. The feed
    // must carry the UTC form; the subscriber's app converts it back.
    const ics = buildTeamCalendar(
      TEAM,
      [gameAt("2026-08-22T01:00:00.000Z")],
      NOW,
    );
    expect(ics).toContain("DTSTART:20260822T010000Z");
  });

  it("ends a game two hours after it starts, a practice ninety minutes", () => {
    const ics = unfold(
      buildTeamCalendar(
        TEAM,
        [
          gameAt("2026-04-01T19:30:00Z"),
          gameAt("2026-04-02T19:30:00Z", { id: "evt-2", type: "PRACTICE" }),
        ],
        NOW,
      ),
    );

    expect(EVENT_DURATION_MS.GAME).toBe(2 * 60 * 60 * 1000);
    expect(EVENT_DURATION_MS.PRACTICE).toBe(90 * 60 * 1000);
    expect(ics).toContain("DTEND:20260401T213000Z");
    expect(ics).toContain("DTEND:20260402T210000Z");
  });

  it("keys UID on the event id with a fixed domain, independent of any host", () => {
    const ics = unfold(buildTeamCalendar(TEAM, [gameAt("2026-04-01T19:30:00Z")], NOW));
    expect(ics).toContain("UID:evt-1@youth-baseball-team-manager");
  });

  it("stamps DTSTAMP from the serve time", () => {
    const ics = unfold(buildTeamCalendar(TEAM, [gameAt("2026-04-01T19:30:00Z")], NOW));
    expect(ics).toContain("DTSTAMP:20260822T120000Z");
  });

  it("emits LOCATION and DESCRIPTION only when present, escaped", () => {
    const withBoth = unfold(
      buildTeamCalendar(
        TEAM,
        [
          gameAt("2026-04-01T19:30:00Z", {
            location: "Field 3, Riverside Park",
            notes: "Arrive early;\nbring water",
          }),
        ],
        NOW,
      ),
    );
    expect(withBoth).toContain("LOCATION:Field 3\\, Riverside Park");
    expect(withBoth).toContain("DESCRIPTION:Arrive early\\;\\nbring water");

    const withNeither = buildTeamCalendar(
      TEAM,
      [gameAt("2026-04-01T19:30:00Z")],
      NOW,
    );
    expect(withNeither).not.toContain("LOCATION");
    expect(withNeither).not.toContain("DESCRIPTION");
  });

  it("cannot be injected with extra properties through coach-entered text", () => {
    const ics = unfold(
      buildTeamCalendar(
        TEAM,
        [
          gameAt("2026-04-01T19:30:00Z", {
            notes: "x\nATTENDEE:mailto:kid@example.com",
          }),
        ],
        NOW,
      ),
    );
    // The newline is escaped into the DESCRIPTION value, never a new line.
    expect(ics).not.toMatch(/^ATTENDEE/m);
    expect(ics).toContain("DESCRIPTION:x\\nATTENDEE:mailto:kid@example.com");
  });

  it("folds long content lines within 75 octets", () => {
    const ics = buildTeamCalendar(
      TEAM,
      [gameAt("2026-04-01T19:30:00Z", { notes: "long ".repeat(60) })],
      NOW,
    );
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});
