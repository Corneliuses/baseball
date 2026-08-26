import { describe, expect, it } from "vitest";

import { MAX_REPEAT_WEEKS } from "@/lib/repeat-weekly";

import { repeatPreview } from "./repeat-preview";

const APRIL_4 = "2026-04-04T18:00";

describe("repeatPreview — what it promises", () => {
  it("names the count and the last date", () => {
    // 4 Apr 2026 is a Saturday; seven more Saturdays lands on 23 May.
    expect(repeatPreview(APRIL_4, "8")).toBe(
      "Creates 8 events, weekly through Sat, May 23.",
    );
  });

  it("counts the start as the first occurrence, not an extra one", () => {
    expect(repeatPreview(APRIL_4, "2")).toBe(
      "Creates 2 events, weekly through Sat, Apr 11.",
    );
  });

  it("rolls over a month end", () => {
    expect(repeatPreview("2026-01-31T18:00", "2")).toBe(
      "Creates 2 events, weekly through Sat, Feb 7.",
    );
  });

  it("rolls over a year end", () => {
    expect(repeatPreview("2026-12-26T10:00", "2")).toBe(
      "Creates 2 events, weekly through Sat, Jan 2.",
    );
  });

  it("previews a run at the cap", () => {
    expect(repeatPreview("2026-04-04T09:00", String(MAX_REPEAT_WEEKS))).toBe(
      `Creates ${MAX_REPEAT_WEEKS} events, weekly through Sat, Oct 24.`,
    );
  });
});

describe("repeatPreview — when it says nothing", () => {
  it("stays quiet for a single event", () => {
    expect(repeatPreview(APRIL_4, "")).toBeNull();
    expect(repeatPreview(APRIL_4, "1")).toBeNull();
  });

  it("stays quiet until there is a date to count from", () => {
    expect(repeatPreview("", "8")).toBeNull();
    expect(repeatPreview("not-a-date", "8")).toBeNull();
  });

  // Above the cap the submit is going to be refused, and a preview promising
  // 31 events beside an error saying the limit is 30 is worse than none.
  it("stays quiet above the cap, where the submit will be refused", () => {
    expect(repeatPreview(APRIL_4, String(MAX_REPEAT_WEEKS + 1))).toBeNull();
    expect(repeatPreview(APRIL_4, "500")).toBeNull();
  });

  it("stays quiet on anything that is not a plain count", () => {
    expect(repeatPreview(APRIL_4, "abc")).toBeNull();
    expect(repeatPreview(APRIL_4, "2.5")).toBeNull();
    expect(repeatPreview(APRIL_4, "-3")).toBeNull();
    // Number("0x10") is 16; the digits-only check is what stops that.
    expect(repeatPreview(APRIL_4, "0x10")).toBeNull();
  });

  it("stays quiet on a date that does not exist, which the submit also rejects", () => {
    expect(repeatPreview("2026-02-30T18:00", "4")).toBeNull();
    expect(repeatPreview("2026-13-01T18:00", "4")).toBeNull();
  });
});

/// The preview is client-side and the write is server-side, so the one thing
/// that would actually hurt is the two naming different days. They cannot
/// disagree about a *date* — "same weekday, seven days on" needs no timezone —
/// and this pins the case where a naive implementation would drift: a run whose
/// dates straddle a DST boundary.
describe("repeatPreview — agreeing with the server", () => {
  it("names the same last date across spring forward", () => {
    // Clocks jump on 8 Mar 2026. weeklyOccurrences holds 6 PM across it, and
    // the date it lands on is 14 Mar either way.
    expect(repeatPreview("2026-03-07T18:00", "2")).toBe(
      "Creates 2 events, weekly through Sat, Mar 14.",
    );
  });

  it("names the same last date across fall back", () => {
    expect(repeatPreview("2026-10-31T18:00", "2")).toBe(
      "Creates 2 events, weekly through Sat, Nov 7.",
    );
  });

  // A late-evening start is the case where a zone-naive implementation reading
  // the *instant* would slip a day; this reads the calendar components, so a
  // 11:30 PM game previews on its own date.
  it("does not slip a day on a late-evening start", () => {
    expect(repeatPreview("2026-07-15T23:30", "2")).toBe(
      "Creates 2 events, weekly through Wed, Jul 22.",
    );
  });
});
