import { describe, it, expect, vi, beforeEach } from "vitest";

const signIn = vi.fn();
const cookieSet = vi.fn();
const cookieGet = vi.fn();
const headerGet = vi.fn();

vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (...args: unknown[]) => cookieSet(...args),
    get: (...args: unknown[]) => cookieGet(...args),
  }),
  headers: async () => ({ get: (...args: unknown[]) => headerGet(...args) }),
}));

// redirect() throws in Next; reproduce that so control flow matches production
// and a "redirected" assertion can't pass by accident.
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

import { requestSignInCode, submitSignInCode } from "./actions";
import { CHECK_EMAIL_INITIAL_STATE } from "./check-email-state";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

async function redirectOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT:")) {
      return error.message.slice("NEXT_REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  headerGet.mockReturnValue("https");
  cookieGet.mockReturnValue(undefined);
});

describe("requestSignInCode", () => {
  it("bounces a malformed address without calling Auth.js", async () => {
    const destination = await redirectOf(
      requestSignInCode(form({ email: "not-an-email" })),
    );

    expect(destination).toBe("/signin?error=invalid-email");
    expect(signIn).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("requests the code, sets the pending cookie, and lands on check-email", async () => {
    const destination = await redirectOf(
      requestSignInCode(
        form({ email: "Parent@Example.com", callbackUrl: "/t/team-a" }),
      ),
    );

    expect(destination).toBe("/signin/check-email");

    // Normalized exactly as Auth.js normalizes the identifier, so the typed
    // code later looks up the row that was actually written.
    expect(signIn).toHaveBeenCalledWith("resend", {
      email: "parent@example.com",
      redirectTo: "/t/team-a",
      redirect: false,
    });

    expect(cookieSet).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieSet.mock.calls[0] as [
      string,
      string,
      { httpOnly: boolean; path: string },
    ];
    expect(name).toBe("__Secure-pending-signin");
    expect(JSON.parse(value)).toEqual({
      email: "parent@example.com",
      callbackUrl: "/t/team-a",
    });
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe("/signin");
  });

  it("uses the unprefixed cookie name over plain HTTP", async () => {
    headerGet.mockReturnValue("http");

    await redirectOf(requestSignInCode(form({ email: "a@b.com" })));

    expect(cookieSet.mock.calls[0][0]).toBe("pending-signin");
  });

  // The failure posture: a denied gate, a Resend outage and a success all end
  // on the same page with the same cookie, so nothing about the response says
  // whether the address is on a team.
  it("still sets the cookie and lands on check-email when the send fails", async () => {
    signIn.mockRejectedValue(new Error("AccessDenied"));

    const destination = await redirectOf(
      requestSignInCode(form({ email: "a@b.com" })),
    );

    expect(destination).toBe("/signin/check-email");
    expect(cookieSet).toHaveBeenCalledTimes(1);
  });
});

describe("submitSignInCode", () => {
  function pendingCookie() {
    cookieGet.mockImplementation((name: string) =>
      name === "__Secure-pending-signin"
        ? {
            value: JSON.stringify({
              email: "parent@example.com",
              callbackUrl: "/t/team-a",
            }),
          }
        : undefined,
    );
  }

  function submit(code: string) {
    return submitSignInCode(CHECK_EMAIL_INITIAL_STATE, form({ code }));
  }

  it("starts over when the pending cookie is gone", async () => {
    const destination = await redirectOf(submit("K3M7QP2X"));

    expect(destination).toBe("/signin?error=code-expired");
  });

  // The value comes back with the state instead of being thrown away by a
  // redirect: eight characters retyped on a phone is where people give up.
  it("returns a mistyped code as state, keeping what was typed", async () => {
    pendingCookie();

    await expect(submit("nope")).resolves.toEqual({
      status: "invalid",
      code: "invalid-code",
      value: "nope",
    });
  });

  // The whole trick of #60: rebuild the URL the magic link used to carry.
  // Auth.js's callback verifies ?token=&email= without caring how they
  // arrived, so the gate, the signIn event and the session cookie all run
  // exactly as they did for a clicked link.
  it("redeems a typed code against the Auth.js email callback", async () => {
    pendingCookie();

    const destination = await redirectOf(submit("k3m7 qp2x"));

    const url = new URL(destination, "https://app.example");
    expect(url.pathname).toBe("/api/auth/callback/resend");
    expect(url.searchParams.get("token")).toBe("K3M7QP2X");
    expect(url.searchParams.get("email")).toBe("parent@example.com");
    expect(url.searchParams.get("callbackUrl")).toBe("/t/team-a");
  });

  // Junk in the unprefixed name used to shadow the real cookie and lock the
  // person out of signing in with nothing on screen to explain it.
  it("ignores a planted unprefixed cookie", async () => {
    cookieGet.mockImplementation((name: string) =>
      name === "pending-signin"
        ? { value: "not json" }
        : {
            value: JSON.stringify({
              email: "parent@example.com",
              callbackUrl: "/",
            }),
          },
    );

    const destination = await redirectOf(submit("K3M7QP2X"));

    expect(destination).toContain("/api/auth/callback/resend");
    expect(new URL(destination, "https://app.example").searchParams.get("email")).toBe(
      "parent@example.com",
    );
  });
});
