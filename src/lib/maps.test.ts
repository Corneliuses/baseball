import { describe, it, expect } from "vitest";

import { mapsUrl } from "./maps";

describe("mapsUrl", () => {
  it("builds a Google Maps search for the location text", () => {
    expect(mapsUrl("Field 3")).toBe("https://maps.google.com/?q=Field%203");
  });

  it("encodes characters that would break the query string", () => {
    expect(mapsUrl("Rogers Park, 400 N Main & 5th")).toBe(
      "https://maps.google.com/?q=Rogers%20Park%2C%20400%20N%20Main%20%26%205th",
    );
  });
});
