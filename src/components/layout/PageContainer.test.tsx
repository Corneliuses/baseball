import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { PageContainer } from "./PageContainer";

function header(sport?: "BASEBALL" | "BASKETBALL") {
  const { container } = render(
    <PageContainer sport={sport}>
      <p>body</p>
    </PageContainer>,
  );
  return container.querySelector("header")!;
}

describe("PageContainer", () => {
  // The team list at / is the owner's front door to every team, whatever the
  // sport, so a page with no team draws no baseball at all.
  it("draws the neutral crest on a plain band outside a team", () => {
    const band = header();
    expect(band.querySelector('[data-crest="neutral"]')).not.toBeNull();
    expect(band.querySelector('[data-crest="baseball"]')).toBeNull();
    expect(band.className).not.toContain("bg-pinstripe");
  });

  it("keeps the baseball crest and pinstripes for a baseball team", () => {
    const band = header("BASEBALL");
    expect(band.querySelector('[data-crest="baseball"]')).not.toBeNull();
    expect(band.className).toContain("bg-pinstripe");
  });

  it("does not lend baseball's branding to another sport", () => {
    const band = header("BASKETBALL");
    expect(band.querySelector('[data-crest="baseball"]')).toBeNull();
    expect(band.className).not.toContain("bg-pinstripe");
  });
});
