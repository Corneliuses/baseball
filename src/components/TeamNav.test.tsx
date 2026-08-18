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
  it("marks the tab whose target is the current page", () => {
    const html = render("PARENT", "/t/team-1/schedule");

    expect(linkFor(html, "/t/team-1/schedule")).toContain('aria-current="page"');
    expect(linkFor(html, "/t/team-1/view")).not.toContain("aria-current");
  });

  it("marks Home only on the team home itself, not on every subpage", () => {
    const home = render("PARENT", "/t/team-1");
    expect(linkFor(home, "/t/team-1")).toContain('aria-current="page"');

    const sub = render("PARENT", "/t/team-1/roster/entry-9");
    expect(linkFor(sub, "/t/team-1")).not.toContain("aria-current");
  });

  it("keeps a section lit on its nested routes", () => {
    for (const [pathname, tab] of [
      ["/t/team-1/chart/positions", "/t/team-1/chart"],
      ["/t/team-1/roster/entry-9", "/t/team-1/roster"],
      ["/t/team-1/roster/returning", "/t/team-1/roster"],
      ["/t/team-1/schedule/event-4", "/t/team-1/schedule"],
    ] as const) {
      expect(linkFor(render("OWNER", pathname), tab)).toContain("aria-current");
    }
  });

  // ARIA reserves "page" for the link whose target IS the current page; a tab
  // that merely contains it is "true". Announcing the Chart tab as the current
  // page while the reader is in the positions editor is just false.
  it("announces a containing section as true, not as the current page", () => {
    const html = render("COACH", "/t/team-1/chart/positions");
    const chart = linkFor(html, "/t/team-1/chart");

    // Asserted as the exact rendered value: a bare `aria-current` attribute
    // would satisfy a substring check while meaning something else entirely.
    expect(chart).toContain('aria-current="true"');
  });

  // /members is owner-only and reached from Settings, but sits at a sibling
  // URL — without an explicit claim the persistent nav goes completely dark
  // on the one page that links to it.
  it("lights Settings on the members page it links to", () => {
    const html = render("OWNER", "/t/team-1/members");

    expect(linkFor(html, "/t/team-1/settings")).toContain("aria-current");
  });

  it("never lights two tabs at once", () => {
    for (const pathname of [
      "/t/team-1",
      "/t/team-1/schedule",
      "/t/team-1/schedule/event-4",
      "/t/team-1/view",
      "/t/team-1/roster/returning",
      "/t/team-1/chart/positions",
      "/t/team-1/members",
      "/t/team-1/settings",
    ]) {
      const lit = render("OWNER", pathname).match(/aria-current/g) ?? [];
      expect(lit, `${pathname} lit ${lit.length} tabs`).toHaveLength(1);
    }
  });
});

describe("TeamNav focus styling", () => {
  // The outline Buttons this nav replaced carried focus rings via
  // buttonVariants; design-plan.md §10 requires them outright. Losing them on
  // the app's primary navigation is the regression this guards.
  it("gives every tab a visible focus ring", () => {
    const html = render("COACH", "/t/team-1/view");

    for (const href of ["/t/team-1/schedule", "/t/team-1/view"]) {
      expect(linkFor(html, href)).toContain("focus-visible:ring-2");
    }
  });

  it("rings the active tab in banana, not the green that would vanish on it", () => {
    const html = render("COACH", "/t/team-1/view");

    expect(linkFor(html, "/t/team-1/view")).toContain(
      "focus-visible:ring-banana",
    );
    expect(linkFor(html, "/t/team-1/schedule")).toContain(
      "focus-visible:ring-ring",
    );
  });
});
