import { describe, it, expect } from "vitest";

import { safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("keeps a same-site path", () => {
    expect(safeCallbackUrl("/t/team-a/roster")).toBe("/t/team-a/roster");
  });

  it("keeps a path with a query string", () => {
    expect(safeCallbackUrl("/t/team-a/roster?tab=chart")).toBe(
      "/t/team-a/roster?tab=chart",
    );
  });

  it("keeps the bare root", () => {
    expect(safeCallbackUrl("/")).toBe("/");
  });

  describe("rejects anything that could leave the site", () => {
    it("rejects a scheme-relative URL", () => {
      expect(safeCallbackUrl("//evil.example/phish")).toBe("/");
    });

    it("rejects a backslash scheme-relative URL, which parsers normalize to //", () => {
      expect(safeCallbackUrl("/\\evil.example/phish")).toBe("/");
    });

    it("rejects an absolute http URL", () => {
      expect(safeCallbackUrl("https://evil.example/phish")).toBe("/");
    });

    it("rejects a javascript: URL", () => {
      expect(safeCallbackUrl("javascript:alert(1)")).toBe("/");
    });

    it.each(["/\t/evil.example", "/\n/evil.example", "/\r\\evil.example"])(
      "rejects %j, which the URL parser turns into a scheme-relative URL",
      (value) => {
        // Regression: the second character is a tab or newline, not a slash,
        // so the "//" check passed it — and new URL() strips it.
        expect(new URL(value, "https://baseball.example").host).toBe(
          "evil.example",
        );
        expect(safeCallbackUrl(value)).toBe("/");
      },
    );

    it("rejects a control character anywhere in the path", () => {
      expect(safeCallbackUrl("/t/team-a\u0000")).toBe("/");
    });

    it("rejects a relative path that does not start with a slash", () => {
      expect(safeCallbackUrl("t/team-a")).toBe("/");
    });
  });

  describe("rejects non-strings", () => {
    it("rejects null", () => {
      expect(safeCallbackUrl(null)).toBe("/");
    });

    it("rejects undefined", () => {
      expect(safeCallbackUrl(undefined)).toBe("/");
    });

    it("rejects a File, which is what a multipart form field can be", () => {
      expect(safeCallbackUrl(new File([], "x"))).toBe("/");
    });
  });
});
