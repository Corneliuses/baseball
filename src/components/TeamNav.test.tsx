import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const usePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

import { TeamNav } from "./TeamNav";
import type { Role } from "@/generated/prisma/enums";

function render(role: Role, pathname = "/t/team-1") {
  usePathname.mockReturnValue(pathname);
  return renderToStaticMarkup(<TeamNav teamId="team-1" role={role} />);
}

/// Pulls the rendered anchor for one href so assertions about active state
/// read the attribute on the right link, not anywhere in the markup.
function linkFor(html: string, href: string): string {
  const match = html.match(new RegExp(`<a[^>]*href="${href}"[^>]*>`));
  expect(match, `expected a link to ${href}`).not.toBeNull();
  return match![0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamNav role gating", () => {
  it("shows a parent only the shared links", () => {
    const html = render("PARENT");

    for (const href of [
      "/t/team-1",
      "/t/team-1/schedule",
      "/t/team-1/view",
      "/t/team-1/roster",
      "/profile",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain('href="/t/team-1/readiness"');
    expect(html).not.toContain('href="/t/team-1/chart"');
    expect(html).not.toContain('href="/t/team-1/directory"');
    expect(html).not.toContain('href="/t/team-1/settings"');
  });

  it("shows a coach the coach links but not settings", () => {
    const html = render("COACH");

    expect(html).toContain('href="/t/team-1/readiness"');
    expect(html).toContain('href="/t/team-1/chart"');
    expect(html).toContain('href="/t/team-1/directory"');
    expect(html).not.toContain('href="/t/team-1/settings"');
  });

  it("shows the owner everything including settings", () => {
    const html = render("OWNER");

    expect(html).toContain('href="/t/team-1/settings"');
  });
});

describe("TeamNav active tab", () => {
  it("marks the current section with aria-current", () => {
    const html = render("PARENT", "/t/team-1/schedule");

    expect(linkFor(html, "/t/team-1/schedule")).toContain('aria-current="page"');
    expect(linkFor(html, "/t/team-1/view")).not.toContain("aria-current");
  });

  it("keeps a section active on its nested routes", () => {
    const html = render("COACH", "/t/team-1/chart/positions");

    expect(linkFor(html, "/t/team-1/chart")).toContain('aria-current="page"');
  });

  it("marks Home only on the team home itself, not on every subpage", () => {
    const home = render("PARENT", "/t/team-1");
    expect(linkFor(home, "/t/team-1")).toContain('aria-current="page"');

    const sub = render("PARENT", "/t/team-1/roster/entry-9");
    expect(linkFor(sub, "/t/team-1")).not.toContain("aria-current");
    expect(linkFor(sub, "/t/team-1/roster")).toContain('aria-current="page"');
  });
});
