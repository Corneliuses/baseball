import { describe, expect, it } from "vitest";

import {
  DEFAULT_ERROR_MESSAGE,
  messageFor,
  messageTable,
} from "@/lib/error-messages";

const TABLE = messageTable({
  "invalid-email": "That doesn't look like an email address.",
  access: "You no longer have access to make this change.",
});

/// Every key a page can be handed from the query string, including the ones a
/// plain object literal answers with an inherited member.
const INHERITED_KEYS = [
  "constructor",
  "__proto__",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
];

describe("messageTable", () => {
  it("returns the message for a key it knows", () => {
    expect(TABLE["access"]).toBe("You no longer have access to make this change.");
  });

  // The bug this module exists for: on `{}` these resolve to functions, which
  // are truthy — so the `??` fallback never fires and React throws
  // "Functions are not valid as a React child".
  it("inherits nothing from Object.prototype", () => {
    for (const key of INHERITED_KEYS) {
      expect(TABLE[key]).toBeUndefined();
    }

    expect(Object.getPrototypeOf(TABLE)).toBeNull();
  });

  it("is frozen, since these are module-level constants shared across requests", () => {
    expect(Object.isFrozen(TABLE)).toBe(true);
  });
});

describe("messageFor", () => {
  it("returns the message for a known key", () => {
    expect(messageFor(TABLE, "access")).toBe(
      "You no longer have access to make this change.",
    );
  });

  // Null and the fallback are different answers: null is "nothing went wrong,
  // render nothing", the fallback is "something failed and we don't recognise
  // the code", which the reader still deserves to hear about.
  it("returns null when there is no key at all", () => {
    expect(messageFor(TABLE, undefined)).toBeNull();
    expect(messageFor(TABLE, "")).toBeNull();
  });

  it("falls back for a key it does not know", () => {
    expect(messageFor(TABLE, "nonsense")).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("falls back for every inherited key", () => {
    for (const key of INHERITED_KEYS) {
      expect(messageFor(TABLE, key)).toBe(DEFAULT_ERROR_MESSAGE);
    }
  });

  it("takes a caller's own fallback, for pages that word it differently", () => {
    expect(messageFor(TABLE, "nonsense", "Sign-in failed.")).toBe("Sign-in failed.");
    expect(messageFor(TABLE, undefined, "Sign-in failed.")).toBeNull();
  });

  // The second layer. A plain literal declared by someone who never read this
  // module still cannot put a function into React through this lookup.
  it("refuses a non-string even from a table that skipped messageTable", () => {
    const unsafe = { access: "fine" } as unknown as ReturnType<typeof messageTable>;

    for (const key of INHERITED_KEYS) {
      expect(messageFor(unsafe, key)).toBe(DEFAULT_ERROR_MESSAGE);
    }
    expect(messageFor(unsafe, "access")).toBe("fine");
  });
});
