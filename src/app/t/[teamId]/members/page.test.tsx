import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MembersPage from "./page";

const requireTeamAccess = vi.fn();
const listTeamMembers = vi.fn();
const listTeamInvitations = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/memberships", () => ({
  listTeamMembers: (...args: unknown[]) => listTeamMembers(...args),
}));

vi.mock("@/lib/invitations", () => ({
  listTeamInvitations: (...args: unknown[]) => listTeamInvitations(...args),
}));

const NOW = new Date("2026-04-01T12:00:00Z");

/// Renders the page for one set of search params. The suite's older cases
/// inline this; new ones use the helper.
async function renderPage(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    await MembersPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
  listTeamMembers.mockResolvedValue([]);
  listTeamInvitations.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

const TWO_MEMBERS = [
  {
    userId: "user-1",
    role: "OWNER" as const,
    name: "Sam",
    email: "sam@example.com",
    phone: null,
  },
  {
    userId: "user-2",
    role: "PARENT" as const,
    name: null,
    email: "test-svjpa8fcr@srv1.mail-tester.com",
    phone: null,
  },
];

describe("Members page", () => {
  it("should export a default function", async () => {
    expect(typeof MembersPage).toBe("function");
  });

  it("is owner-only even to read", async () => {
    // Unlike the roster, members and invitations are not something every
    // parent — or coach — needs to see.
    await renderPage();

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "read",
      minRole: "OWNER",
    });
  });

  it("shows only live invitations as pending", async () => {
    listTeamInvitations.mockResolvedValue([
      {
        id: "inv-1",
        email: "live@example.com",
        role: "PARENT",
        expiresAt: new Date(NOW.getTime() + 1000),
        acceptedAt: null,
        createdAt: NOW,
      },
      {
        id: "inv-2",
        email: "expired@example.com",
        role: "PARENT",
        expiresAt: new Date(NOW.getTime() - 1000),
        acceptedAt: null,
        createdAt: NOW,
      },
      {
        id: "inv-3",
        email: "accepted@example.com",
        role: "PARENT",
        expiresAt: new Date(NOW.getTime() + 1000),
        acceptedAt: NOW,
        createdAt: NOW,
      },
    ]);

    const result = await MembersPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    expect(markup).toContain("live@example.com");
    expect(markup).not.toContain("expired@example.com");
    expect(markup).not.toContain("accepted@example.com");
  });

  it("disables the role control for the team's only owner", async () => {
    listTeamMembers.mockResolvedValue([
      { userId: "user-1", role: "OWNER", name: "Sam", email: "sam@example.com", phone: null },
      { userId: "user-2", role: "COACH", name: "Alex", email: "alex@example.com", phone: null },
    ]);

    const result = await MembersPage({
      params: Promise.resolve({ teamId: "team-1" }),
      searchParams: Promise.resolve({}),
    });

    const markup = renderToStaticMarkup(result);
    const ownerRowIndex = markup.indexOf("Sam");
    const ownerFormEnd = markup.indexOf("</form>", ownerRowIndex);
    const ownerForm = markup.slice(ownerRowIndex, ownerFormEnd);
    expect(ownerForm).toContain("disabled");
  });
});

describe("MembersPage removal", () => {
  beforeEach(() => {
    listTeamMembers.mockResolvedValue(TWO_MEMBERS);
  });

  it("offers a Remove step per member, but never for the last owner", async () => {
    const markup = await renderPage();

    // The parent's row links into the confirm step for exactly that member.
    expect(markup).toContain(
      "/t/team-1/members?confirm=remove&amp;member=user-2",
    );
    // Sam is the only owner — same rule that disables their role select.
    expect(markup).not.toContain("member=user-1");
  });

  it("confirms before removing, on the named row only", async () => {
    const markup = await renderPage({ confirm: "remove", member: "user-2" });

    expect(markup).toContain("Remove test-svjpa8fcr@srv1.mail-tester.com");
    expect(markup).toContain("Yes, remove them");
    expect(markup).toContain("are not deleted");
  });

  it("does not show the confirm step without the param", async () => {
    const markup = await renderPage();

    expect(markup).not.toContain("Yes, remove them");
  });

  it("confirms a completed removal", async () => {
    const markup = await renderPage({ removed: "1" });

    expect(markup).toContain("Member removed.");
    expect(markup).toContain('role="status"');
  });

  it("lets a long unspaced address break instead of pushing controls off screen", async () => {
    // The row is stacked now, but the address itself still needs break-all —
    // an email is one long token, and break-words won't split it until it has
    // already overflowed the card (the screenshot bug).
    const markup = await renderPage();

    // Second occurrence: the first is the name line falling back to the email
    // for a member with no name (break-words there), the second is the email
    // line proper.
    const address = "test-svjpa8fcr@srv1.mail-tester.com";
    const emailIndex = markup.indexOf(address, markup.indexOf(address) + 1);
    expect(emailIndex).toBeGreaterThan(-1);
    const tagStart = markup.lastIndexOf("<p", emailIndex);
    const emailTag = markup.slice(tagStart, emailIndex);
    expect(emailTag).toContain("break-all");
  });
});

describe("MembersPage role labels", () => {
  it("writes roles the way a person would, not the way the database does", async () => {
    // The select's options used to read OWNER / COACH / PARENT — shouted
    // database constants on a screen for people (C7). The directory page had
    // the friendly spellings all along, in a map only it could see.
    listTeamMembers.mockResolvedValue([
      {
        userId: "user-1",
        role: "OWNER",
        name: "Sam",
        email: "sam@example.com",
        phone: null,
      },
      {
        userId: "user-2",
        role: "COACH",
        name: "Alex",
        email: "alex@example.com",
        phone: null,
      },
    ]);

    const markup = await renderPage();

    expect(markup).toContain(">Owner<");
    expect(markup).toContain(">Coach<");
    expect(markup).toContain(">Parent<");
    expect(markup).not.toContain(">OWNER<");
    expect(markup).not.toContain(">PARENT<");
  });
});

describe("MembersPage feedback", () => {
  it("confirms a role change, which used to happen in silence", async () => {
    // setMemberRoleAction redirected with no param at all, so a successful
    // save was indistinguishable from a click that did nothing: the select
    // simply re-rendered showing the value it already showed.
    const markup = await renderPage({ "role-saved": "1" });

    expect(markup).toContain("Role updated.");
    expect(markup).toContain('role="status"');
  });

  it("confirms a withdrawal and a resend", async () => {
    expect(await renderPage({ revoked: "1" })).toContain("Invitation withdrawn.");

    const resent = await renderPage({ resent: "1" });
    expect(resent).toContain("sent again");
    // Worth saying out loud: resending re-issues, so the old link dies.
    expect(resent).toContain("no longer works");
  });

  it("lets an error win over a success param", async () => {
    const markup = await renderPage({ "role-saved": "1", error: "last-owner" });

    expect(markup).toContain("at least one owner");
    expect(markup).not.toContain("Role updated.");
  });
});
