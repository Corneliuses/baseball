import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getInvitationByToken = vi.fn();
const resolveInvitedUser = vi.fn();
const acceptInvitations = vi.fn();
const beginLogin = vi.fn();
const cookieSet = vi.fn();
const headerGet = vi.fn();

vi.mock("@/lib/invitations", () => ({
  getInvitationByToken: (...args: unknown[]) => getInvitationByToken(...args),
  resolveInvitedUser: (...args: unknown[]) => resolveInvitedUser(...args),
  acceptInvitations: (...args: unknown[]) => acceptInvitations(...args),
}));

vi.mock("@/lib/login-start", () => ({
  beginLogin: (...args: unknown[]) => beginLogin(...args),
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
const AUTHORIZE_URL =
  "https://auth.example.com/authorize?client_id=app&login_hint=sam%40example.com";
const PENDING_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: true,
  maxAge: 600,
};

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
  beginLogin.mockResolvedValue({
    authorizeUrl: AUTHORIZE_URL,
    cookie: {
      name: "__Host-pending-login",
      value: "sealed",
      options: PENDING_OPTIONS,
    },
  });
  headerGet.mockReturnValue("https");
  delete process.env.AUTH_URL;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("acceptInvitationAction", () => {
  it("grants the membership, then starts a login pinned to the invited address", async () => {
    expect(await destinationOf(form("tok-1"))).toBe(AUTHORIZE_URL);

    // The address comes from the invitation row, never from the form.
    expect(resolveInvitedUser).toHaveBeenCalledWith("sam@example.com", NOW);
    expect(acceptInvitations).toHaveBeenCalledWith(
      "user-1",
      "sam@example.com",
      NOW,
    );
    expect(beginLogin).toHaveBeenCalledWith({
      returnTo: "/t/team-1",
      loginHint: "sam@example.com",
      // The service only pre-fills the hint; without this a live SSO session
      // for someone else on the device would answer for them.
      prompt: "login",
      secure: true,
      now: NOW,
    });
    expect(cookieSet).toHaveBeenCalledWith(
      "__Host-pending-login",
      "sealed",
      PENDING_OPTIONS,
    );
  });

  // The callback is the only writer of the session cookie now.
  it("writes no session cookie of its own", async () => {
    await destinationOf(form("tok-1"));

    expect(cookieSet).toHaveBeenCalledTimes(1);
    expect(cookieSet).not.toHaveBeenCalledWith(
      expect.stringContaining("session-token"),
      expect.anything(),
      expect.anything(),
    );
  });

  it("starts an insecure login over plain HTTP", async () => {
    headerGet.mockReturnValue("http");

    await destinationOf(form("tok-1"));

    expect(beginLogin).toHaveBeenCalledWith(
      expect.objectContaining({ secure: false }),
    );
  });

  it("grants the membership before starting the login", async () => {
    const order: string[] = [];
    acceptInvitations.mockImplementation(async () => {
      order.push("accept");
      return 1;
    });
    beginLogin.mockImplementation(async () => {
      order.push("login");
      return {
        authorizeUrl: AUTHORIZE_URL,
        cookie: { name: "__Host-pending-login", value: "sealed", options: PENDING_OPTIONS },
      };
    });

    await destinationOf(form("tok-1"));

    expect(order).toEqual(["accept", "login"]);
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

    expect(await destinationOf(form("tok-1"))).toBe(AUTHORIZE_URL);

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

  // A missing auth service variable. The invitation is spent by then, so
  // "try again" on the invite page would only show "Already accepted"; the
  // parent is a member, so /signin is the way on, headed for the team.
  it("sends a granted parent to /signin when the login cannot start", async () => {
    beginLogin.mockRejectedValue(new Error("AUTH_ISSUER is not set"));

    const destination = new URL(
      await destinationOf(form("tok-1")),
      "https://x.example",
    );
    expect(destination.pathname).toBe("/signin");
    expect(destination.searchParams.get("error")).toBe("signin-failed");
    expect(destination.searchParams.get("callbackUrl")).toBe("/t/team-1");
    expect(cookieSet).not.toHaveBeenCalled();
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
