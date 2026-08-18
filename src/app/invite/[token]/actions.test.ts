import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getInvitationByToken = vi.fn();
const resolveInvitedUser = vi.fn();
const acceptInvitations = vi.fn();
const createUserSession = vi.fn();
const cookieSet = vi.fn();
const headerGet = vi.fn();

vi.mock("@/lib/invitations", () => ({
  getInvitationByToken: (...args: unknown[]) => getInvitationByToken(...args),
  resolveInvitedUser: (...args: unknown[]) => resolveInvitedUser(...args),
  acceptInvitations: (...args: unknown[]) => acceptInvitations(...args),
}));

vi.mock("@/lib/sessions", () => ({
  createUserSession: (...args: unknown[]) => createUserSession(...args),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (...args: unknown[]) => cookieSet(...args) }),
  headers: async () => ({ get: (...args: unknown[]) => headerGet(...args) }),
}));

// redirect() throws in Next; reproduce that so control flow matches production
// and a "redirected" assertion can't pass by accident. Identified by message
// prefix rather than a class, because vi.mock factories are hoisted above any
// top-level declaration they'd reference.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  },
}));

import { acceptInvitationAction } from "./actions";

const NOW = new Date("2026-04-01T12:00:00Z");
const EXPIRES = new Date("2026-07-01T12:00:00Z");

function liveInvitation() {
  return {
    teamId: "team-1",
    teamName: "Cubs",
    email: "sam@example.com",
    role: "PARENT" as const,
    expiresAt: new Date(NOW.getTime() + 60_000),
    acceptedAt: null,
  };
}

function form(token: unknown) {
  const data = new FormData();
  if (token !== undefined) {
    data.set("token", String(token));
  }
  return data;
}

/// Every success and failure path ends in a redirect, so the assertion is
/// always "where did it throw us".
async function destinationOf(data: FormData): Promise<string> {
  try {
    await acceptInvitationAction(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("NEXT_REDIRECT:")) {
      return message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("Expected the action to redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});

  getInvitationByToken.mockResolvedValue(liveInvitation());
  resolveInvitedUser.mockResolvedValue({
    id: "user-1",
    email: "sam@example.com",
  });
  acceptInvitations.mockResolvedValue(1);
  createUserSession.mockResolvedValue({
    sessionToken: "session-token-1",
    expires: EXPIRES,
  });
  headerGet.mockReturnValue("https");
  delete process.env.AUTH_URL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("acceptInvitationAction", () => {
  it("grants the membership, writes a session cookie, and lands on the team", async () => {
    expect(await destinationOf(form("tok-1"))).toBe("/t/team-1");

    // The address comes from the invitation row, never from the form.
    expect(resolveInvitedUser).toHaveBeenCalledWith("sam@example.com", NOW);
    expect(acceptInvitations).toHaveBeenCalledWith(
      "user-1",
      "sam@example.com",
      NOW,
    );
    expect(createUserSession).toHaveBeenCalledWith("user-1", NOW);
    expect(cookieSet).toHaveBeenCalledWith(
      "__Secure-authjs.session-token",
      "session-token-1",
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        expires: EXPIRES,
      },
    );
  });

  it("writes the unprefixed cookie name over plain HTTP", async () => {
    headerGet.mockReturnValue("http");

    await destinationOf(form("tok-1"));

    expect(cookieSet).toHaveBeenCalledWith(
      "authjs.session-token",
      "session-token-1",
      expect.objectContaining({ secure: false }),
    );
  });

  it("grants the membership before creating the session", async () => {
    const order: string[] = [];
    acceptInvitations.mockImplementation(async () => {
      order.push("accept");
      return 1;
    });
    createUserSession.mockImplementation(async () => {
      order.push("session");
      return { sessionToken: "session-token-1", expires: EXPIRES };
    });

    await destinationOf(form("tok-1"));

    expect(order).toEqual(["accept", "session"]);
  });

  // Regression: the action used to read the clock separately in each step, so
  // an invitation could be live when checked and expired by the time
  // acceptInvitations filtered on expiresAt — granting no Membership while
  // still writing a session. The clock is advanced past expiry mid-action to
  // force exactly that interleaving.
  it("judges liveness and consumes the invitation at one instant", async () => {
    getInvitationByToken.mockResolvedValue({
      ...liveInvitation(),
      expiresAt: new Date(NOW.getTime() + 1_000),
    });
    resolveInvitedUser.mockImplementation(async () => {
      vi.advanceTimersByTime(5_000);
      return { id: "user-1", email: "sam@example.com" };
    });

    expect(await destinationOf(form("tok-1"))).toBe("/t/team-1");

    // Not merely "some Date" — the instant the liveness check passed at, which
    // is the only one the write is entitled to act on.
    expect(acceptInvitations).toHaveBeenCalledWith(
      "user-1",
      "sam@example.com",
      NOW,
    );
  });

  it("sends an unknown token back to the invite page without writing anything", async () => {
    getInvitationByToken.mockResolvedValue(null);

    expect(await destinationOf(form("tok-1"))).toBe("/invite/tok-1");
    expect(acceptInvitations).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  // Liveness is re-checked here rather than trusted from the page render: the
  // invitation can expire between the page loading and this submitting.
  it("sends an expired token back to the invite page without writing anything", async () => {
    getInvitationByToken.mockResolvedValue({
      ...liveInvitation(),
      expiresAt: new Date(NOW.getTime() - 1),
    });

    expect(await destinationOf(form("tok-1"))).toBe("/invite/tok-1");
    expect(acceptInvitations).not.toHaveBeenCalled();
  });

  it("sends an already-accepted token back to the invite page", async () => {
    getInvitationByToken.mockResolvedValue({
      ...liveInvitation(),
      acceptedAt: NOW,
    });

    expect(await destinationOf(form("tok-1"))).toBe("/invite/tok-1");
    expect(acceptInvitations).not.toHaveBeenCalled();
  });

  it("shows an error rather than a team page when the grant fails", async () => {
    acceptInvitations.mockRejectedValue(new Error("db down"));

    expect(await destinationOf(form("tok-1"))).toBe("/invite/tok-1?error=1");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  // The parent is a member by then, so /signin admits them — but they must not
  // be sent to a team page they hold no session for.
  it("shows an error when the session write fails after the grant succeeded", async () => {
    createUserSession.mockRejectedValue(new Error("db down"));

    expect(await destinationOf(form("tok-1"))).toBe("/invite/tok-1?error=1");
  });

  it("rejects a missing or placeholder token outright", async () => {
    await expect(acceptInvitationAction(form(undefined))).rejects.toThrow(
      "Invalid invitation token",
    );
    await expect(acceptInvitationAction(form("null"))).rejects.toThrow(
      "Invalid invitation token",
    );
    await expect(acceptInvitationAction(form("  "))).rejects.toThrow(
      "Invalid invitation token",
    );
    expect(getInvitationByToken).not.toHaveBeenCalled();
  });
});
