import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorTabs } from "./EditorTabs";

function render(active: "order" | "positions") {
  return renderToStaticMarkup(<EditorTabs teamId="team-1" active={active} />);
}

/// The rendered anchor for one href, so an active-state assertion lands on the
/// right link rather than anywhere in the markup.
function linkFor(html: string, href: string): string {
  const match = new RegExp(`<a[^>]*href="${href}"[^>]*>`).exec(html);
  expect(match, `expected a link to ${href}`).not.toBeNull();
  return match![0];
}

describe("EditorTabs", () => {
  it("puts both halves of the chart at the same level", () => {
    // Before this, the positions board hid behind a small outline button
    // inside the batting-order page — one of the coach's two main tools was
    // reachable only by opening the other one first and knowing to look (C4).
    const html = render("order");

    expect(html).toContain('href="/t/team-1/chart"');
    expect(html).toContain('href="/t/team-1/chart/positions"');
    expect(html).toContain("Batting order");
    expect(html).toContain("Positions");
  });

  it("marks the half being edited, and only that one", () => {
    const onOrder = render("order");
    expect(linkFor(onOrder, "/t/team-1/chart")).toContain('aria-current="page"');
    expect(linkFor(onOrder, "/t/team-1/chart/positions")).not.toContain(
      "aria-current",
    );

    const onPositions = render("positions");
    expect(linkFor(onPositions, "/t/team-1/chart/positions")).toContain(
      'aria-current="page"',
    );
    expect(linkFor(onPositions, "/t/team-1/chart")).not.toContain("aria-current");
  });

  it("rings the active segment in banana, like the nav's active pill", () => {
    // --ring is Field Green in light mode, which on a green fill is a green
    // ring on green — invisible outdoors, which is where this is read.
    const html = render("order");

    expect(linkFor(html, "/t/team-1/chart")).toContain("focus-visible:ring-banana");
    expect(linkFor(html, "/t/team-1/chart/positions")).toContain(
      "focus-visible:ring-ring",
    );
  });

  it("points at the read-only board by the name the nav now gives it", () => {
    // "View chart" named a tab called "Lineup" that no longer exists under
    // that name — the rename is only half done if the cross-links lag.
    const html = render("positions");

    expect(html).toContain('href="/t/team-1/view"');
    expect(html).toContain("See Game Day view");
    expect(html).not.toContain("View chart");
  });

  it("names its own group for a screen reader", () => {
    expect(render("order")).toContain('aria-label="Lineup editor"');
  });
});
