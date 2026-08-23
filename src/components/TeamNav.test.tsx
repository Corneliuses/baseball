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
      "/t/team-1/messages",
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

  // Messages is the one tab parents and coaches share beyond the read
  // surfaces: parents need the path to reach the coaching staff.
  it("shows Messages to every role", () => {
    for (const role of ["PARENT", "COACH", "OWNER"] as const) {
      expect(render(role)).toContain('href="/t/team-1/messages"');
    }
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
      ["/t/team-1/messages/new", "/t/team-1/messages"],
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

  // /members used to be reachable only through a button on Settings, and the
  // Settings tab borrowed its URL via `alsoMatch` so the nav didn't go dark
  // there. Now Members has a tab of its own (#51 / C4), so it lights that one
  // — and Settings must *stop* claiming a section it no longer owns.
  it("lights Members on its own page, not Settings", () => {
    const html = render("OWNER", "/t/team-1/members");

    expect(linkFor(html, "/t/team-1/members")).toContain('aria-current="page"');
    expect(linkFor(html, "/t/team-1/settings")).not.toContain("aria-current");
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

describe("TeamNav labels", () => {
  // The audit's C4 in one assertion: "Lineup" was the read-only view and
  // "Chart" was the editor, so the tab that sounded like a document was the
  // one that wrote to the database. The pair now states which is which.
  it("names the viewer and the editor so they cannot be confused", () => {
    const html = render("COACH");

    expect(linkFor(html, "/t/team-1/view")).toBeTruthy();
    expect(html).toContain("Game Day");
    expect(html).toContain("Edit Lineup");
    expect(html).not.toContain(">Lineup<");
    expect(html).not.toContain(">Chart<");
  });

  it("gives Members a tab instead of hiding it under Settings", () => {
    const html = render("OWNER");

    expect(html).toContain('href="/t/team-1/members"');
    expect(html).toContain("Members");
  });

  it("keeps Members owner-only", () => {
    expect(render("COACH")).not.toContain('href="/t/team-1/members"');
    expect(render("PARENT")).not.toContain('href="/t/team-1/members"');
  });
});

describe("TeamNav grouping", () => {
  it("separates the coach's rack from the shared tabs", () => {
    // Nine ungrouped pills mixed coach tools with parent pages with nothing to
    // tell them apart (C4). The seam is decoration for a boundary the pages
    // themselves enforce, so it is aria-hidden rather than announced.
    const html = render("COACH");

    expect(html).toContain('aria-hidden="true"');
    expect(linkFor(html, "/t/team-1/readiness")).toContain("bg-secondary");
    expect(linkFor(html, "/t/team-1/schedule")).toContain("bg-card");
  });

  it("draws no seam for a parent, who has no coach tabs", () => {
    const html = render("PARENT");

    // Every icon is aria-hidden, so count the seam by its own dash pattern
    // rather than by that attribute.
    expect(html).not.toContain('stroke-dasharray="3 3"');
  });

  it("puts an icon beside every label, never instead of one", () => {
    // design-plan.md §10: meaning is never carried by shape or colour alone.
    const html = render("OWNER");

    expect(html).toContain("<svg");
    for (const label of ["Home", "Schedule", "Game Day", "Roster", "Settings"]) {
      expect(html).toContain(label);
    }
  });
});
