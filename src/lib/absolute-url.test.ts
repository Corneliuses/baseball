import { describe, expect, it } from "vitest";

import { absoluteUrl } from "./absolute-url";

describe("absoluteUrl", () => {
  it("prefers AUTH_URL over every other source", () => {
    expect(
      absoluteUrl("/invite/abc", {
        AUTH_URL: "https://app.example.com",
        VERCEL_PROJECT_PRODUCTION_URL: "prod.example.com",
        VERCEL_URL: "deploy.example.com",
      }),
    ).toBe("https://app.example.com/invite/abc");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when AUTH_URL is unset", () => {
    expect(
      absoluteUrl("/invite/abc", {
        VERCEL_PROJECT_PRODUCTION_URL: "prod.example.com",
        VERCEL_URL: "deploy.example.com",
      }),
    ).toBe("https://prod.example.com/invite/abc");
  });

  it("falls back to VERCEL_URL when only that is set", () => {
    expect(
      absoluteUrl("/invite/abc", { VERCEL_URL: "deploy.example.com" }),
    ).toBe("https://deploy.example.com/invite/abc");
  });

  it("falls back to localhost when nothing is set", () => {
    expect(absoluteUrl("/invite/abc", {})).toBe(
      "http://localhost:3000/invite/abc",
    );
  });

  it("strips a trailing slash on the base", () => {
    expect(
      absoluteUrl("/invite/abc", { AUTH_URL: "https://app.example.com/" }),
    ).toBe("https://app.example.com/invite/abc");
  });

  it("adds a leading slash to the path if missing", () => {
    expect(
      absoluteUrl("invite/abc", { AUTH_URL: "https://app.example.com" }),
    ).toBe("https://app.example.com/invite/abc");
  });

  it("does not double the scheme on a Vercel host that already has one", () => {
    expect(
      absoluteUrl("/invite/abc", {
        VERCEL_URL: "https://deploy.example.com",
      }),
    ).toBe("https://deploy.example.com/invite/abc");
  });
});
