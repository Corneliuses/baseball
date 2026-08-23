import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import {
  clearDraft,
  draftSnapshot,
  parseDraft,
  serverDraftSnapshot,
  stashDraft,
  subscribeDraft,
} from "./draft-stash";

beforeEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("stashing a chart draft", () => {
  it("round-trips the lines it was given", () => {
    stashDraft("team-1", "order", ["1. Ava C.", "2. Ben R."]);

    expect(parseDraft(draftSnapshot("team-1", "order"))).toEqual([
      "1. Ava C.",
      "2. Ben R.",
    ]);
  });

  it("keeps the two boards apart", () => {
    // A coach may have both editors open. One conflict must not surface the
    // other board's draft under the wrong heading.
    stashDraft("team-1", "order", ["1. Ava C."]);
    stashDraft("team-1", "positions", ["Pitcher — Ben R."]);

    expect(parseDraft(draftSnapshot("team-1", "order"))).toEqual(["1. Ava C."]);
    expect(parseDraft(draftSnapshot("team-1", "positions"))).toEqual([
      "Pitcher — Ben R.",
    ]);
  });

  it("keeps teams apart", () => {
    // Team id is in the URL, never in a session — two tabs on two teams is a
    // supported way to work, and the whole reason for that rule.
    stashDraft("team-1", "order", ["1. Ava C."]);

    expect(draftSnapshot("team-2", "order")).toBeNull();
  });

  it("forgets a draft once it is dismissed", () => {
    stashDraft("team-1", "order", ["1. Ava C."]);
    clearDraft("team-1", "order");

    expect(draftSnapshot("team-1", "order")).toBeNull();
  });
});

describe("reading a draft defensively", () => {
  it("reports nothing when nothing was stashed", () => {
    expect(parseDraft(draftSnapshot("team-1", "order"))).toBeNull();
  });

  it("treats a payload from another version as nothing stashed", () => {
    // The store belongs to the browser, not to this build. An older or
    // hand-edited shape must read as empty rather than crash a component.
    window.sessionStorage.setItem("chart-draft:team-1:order", '{"slots":[1,2]}');

    expect(parseDraft(draftSnapshot("team-1", "order"))).toBeNull();
  });

  it("treats unparseable content as nothing stashed", () => {
    window.sessionStorage.setItem("chart-draft:team-1:order", "not json");

    expect(parseDraft(draftSnapshot("team-1", "order"))).toBeNull();
  });

  it("survives a browser that refuses storage entirely", () => {
    // Private windows and blocked site data throw on access rather than
    // returning null. Degrading quietly is exactly the behaviour that existed
    // before this module — the editor must not break over a safety net.
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(draftSnapshot("team-1", "order")).toBeNull();
  });

  it("does not throw when storage refuses a write", () => {
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => stashDraft("team-1", "order", ["1. Ava C."])).not.toThrow();
  });

  it("renders nothing on the server, where there is no storage", () => {
    expect(serverDraftSnapshot()).toBeNull();
  });
});

describe("subscribing to the stash", () => {
  it("tells listeners when a draft is stashed or cleared", () => {
    // This is how Dismiss makes the panel disappear: the component holds no
    // copy of the state, so the store has to say when it changed.
    const listener = vi.fn();
    const unsubscribe = subscribeDraft(listener);

    stashDraft("team-1", "order", ["1. Ava C."]);
    expect(listener).toHaveBeenCalledTimes(1);

    clearDraft("team-1", "order");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    stashDraft("team-1", "order", ["1. Ava C."]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
