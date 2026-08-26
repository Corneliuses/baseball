import { describe, expect, it } from "vitest";

import {
  announceableOccurrences,
  buildAnnouncementRecipients,
  shouldAnnounceEvent,
} from "@/lib/announcements";
import type { GuardianRosterEntry } from "@/lib/guardians";

function player(
  playerId: string,
  playerName: string,
  guardians: GuardianRosterEntry["guardians"],
): GuardianRosterEntry {
  return { playerId, playerName, guardians };
}

const dana = { userId: "u-dana", email: "dana@example.com", name: "Dana" };
const eli = { userId: "u-eli", email: "eli@example.com", name: null };

describe("buildAnnouncementRecipients", () => {
  it("returns one recipient per guardian", () => {
    const recipients = buildAnnouncementRecipients([
      player("p1", "Ava", [dana]),
      player("p2", "Ben", [eli]),
    ]);

    expect(recipients).toEqual([dana, eli]);
  });

  // The rule the whole module exists for: a household guarding two kids on the
  // roster gets one email about the game, not two.
  it("collapses a household that guards two rostered kids into one recipient", () => {
    const recipients = buildAnnouncementRecipients([
      player("p1", "Ava", [dana]),
      player("p2", "Cal", [dana]),
    ]);

    expect(recipients).toEqual([dana]);
  });

  it("keeps both guardians of one kid", () => {
    const recipients = buildAnnouncementRecipients([
      player("p1", "Ava", [dana, eli]),
    ]);

    expect(recipients).toEqual([dana, eli]);
  });

  it("preserves roster order, so a half-sent batch stops at a predictable prefix", () => {
    const recipients = buildAnnouncementRecipients([
      player("p1", "Ava", [eli]),
      player("p2", "Ben", [dana]),
    ]);

    expect(recipients.map((r) => r.userId)).toEqual(["u-eli", "u-dana"]);
  });

  it("skips a guardian with an empty address rather than sending to nowhere", () => {
    const recipients = buildAnnouncementRecipients([
      player("p1", "Ava", [{ userId: "u-blank", email: "", name: "Blank" }, dana]),
    ]);

    expect(recipients).toEqual([dana]);
  });

  it("returns nothing for a roster with no guardians linked yet", () => {
    expect(buildAnnouncementRecipients([player("p1", "Ava", [])])).toEqual([]);
  });

  it("returns nothing for an empty roster", () => {
    expect(buildAnnouncementRecipients([])).toEqual([]);
  });
});

describe("shouldAnnounceEvent", () => {
  const now = new Date("2026-08-23T17:00:00Z");

  it("announces an event in the future", () => {
    expect(shouldAnnounceEvent(new Date("2026-08-29T22:30:00Z"), now)).toBe(true);
  });

  it("stays quiet about an event a coach back-filled from last week", () => {
    expect(shouldAnnounceEvent(new Date("2026-08-15T22:30:00Z"), now)).toBe(false);
  });

  // The boundary, pinned because a later refactor flips > to >= without
  // noticing: an event starting exactly now is already under way.
  it("stays quiet about an event starting at exactly this instant", () => {
    expect(shouldAnnounceEvent(new Date(now), now)).toBe(false);
  });

  // Not GAME_GRACE_MS: that window is for displays naming the game in
  // progress, and this is a send.
  it("stays quiet about a game that started an hour ago, grace window or not", () => {
    expect(shouldAnnounceEvent(new Date("2026-08-23T16:00:00Z"), now)).toBe(false);
  });
});

describe("announceableOccurrences", () => {
  const now = new Date("2026-08-23T17:00:00Z");

  /// Shaped like the rows the action actually passes — an id alongside the
  /// instant, so these assertions also pin that whole records come back rather
  /// than bare dates.
  const week = (weeks: number) => ({
    id: `evt-${weeks}`,
    startsAt: new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000),
  });

  it("keeps every occurrence of a run that is entirely ahead", () => {
    const run = [week(1), week(2), week(3)];

    expect(announceableOccurrences(run, now)).toEqual(run);
  });

  // The case it exists for: a coach entering a season that already started.
  // The played games are still created — the schedule is a record — but nobody
  // is mailed about them.
  it("keeps only the future half of a back-filled season", () => {
    const run = [week(-2), week(-1), week(1), week(2)];

    expect(announceableOccurrences(run, now)).toEqual([week(1), week(2)]);
  });

  it("returns nothing when the whole run has already happened", () => {
    expect(announceableOccurrences([week(-3), week(-2), week(-1)], now)).toEqual(
      [],
    );
  });

  it("preserves order, so the email lists dates the way the schedule does", () => {
    expect(announceableOccurrences([week(3), week(1), week(2)], now)).toEqual([
      week(3),
      week(1),
      week(2),
    ]);
  });

  // Same boundary as shouldAnnounceEvent, pinned here too because this is the
  // function both announcement paths actually call.
  it("drops an occurrence starting at exactly this instant", () => {
    expect(
      announceableOccurrences([{ id: "now", startsAt: new Date(now) }, week(1)], now),
    ).toEqual([week(1)]);
  });

  // The single-event path routes through here too, so a run of one has to
  // behave exactly like shouldAnnounceEvent on its own.
  it("handles a run of one either way", () => {
    expect(announceableOccurrences([week(1)], now)).toEqual([week(1)]);
    expect(announceableOccurrences([week(-1)], now)).toEqual([]);
  });

  it("returns nothing for an empty run", () => {
    expect(announceableOccurrences([], now)).toEqual([]);
  });
});
