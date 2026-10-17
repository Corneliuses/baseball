import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getCurrentUser = vi.fn();
const updateProfile = vi.fn();
const deleteUserSession = vi.fn();
const buildLogoutUrl = vi.fn();
const getAuthConfig = vi.fn();
const cookieJar = new Map<string, string>();
const cookieSet = vi.fn();
let forwardedProto: string | null = "https";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (...args: unknown[]) => cookieSet(...args),
  }),
  headers: async () => ({
    get: (name: string) =>
      name === "x-forwarded-proto" ? forwardedProto : null,
  }),
}));

vi.mock("@/lib/sessions", () => ({
  deleteUserSession: (...args: unknown[]) => deleteUserSession(...args),
}));

vi.mock("@/lib/auth-client", () => ({
  getAuthClient: () => ({
    buildLogoutUrl: (...args: unknown[]) => buildLogoutUrl(...args),
  }),
  getAuthConfig: () => getAuthConfig(),
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

vi.mock("@/lib/profile", () => ({
  updateProfile: (...args: unknown[]) => updateProfile(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
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

import { signOutAction } from "./actions";

const SECURE_NAME = "__Secure-authjs.session-token";
const CLEARED = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: true,
  maxAge: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("AUTH_URL", "");
  cookieJar.clear();
  forwardedProto = "https";
  cookieJar.set(SECURE_NAME, "tok");
  deleteUserSession.mockResolvedValue({ idToken: null });
  getAuthConfig.mockReturnValue({
    postLogoutRedirectUri: "https://baseball.corneliuses.com/",
  });
  buildLogoutUrl.mockReturnValue(
    "https://auth.corneliuses.com/logout?id_token_hint=id.tok.en",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("signOutAction", () => {
  // Landing on "/" is load-bearing: /profile would be bounced by Proxy to
  // /signin, and the person who just signed out would conclude it failed.
  it("ends a pre-service session locally and lands on the home page", async () => {
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");

    expect(deleteUserSession).toHaveBeenCalledWith("tok");
    expect(cookieSet).toHaveBeenCalledWith(SECURE_NAME, "", CLEARED);
    expect(buildLogoutUrl).not.toHaveBeenCalled();
  });

  it("hands a service-issued session's id token to the service's logout", async () => {
    deleteUserSession.mockResolvedValue({ idToken: "id.tok.en" });

    await expect(signOutAction()).rejects.toThrow(
      "NEXT_REDIRECT:https://auth.corneliuses.com/logout?id_token_hint=id.tok.en",
    );
    expect(buildLogoutUrl).toHaveBeenCalledWith({
      idToken: "id.tok.en",
      postLogoutRedirectUri: "https://baseball.corneliuses.com/",
    });
    expect(cookieSet).toHaveBeenCalledWith(SECURE_NAME, "", CLEARED);
  });

  // The row is already gone; a missing env var must not turn a finished
  // sign-out into an error page.
  it("still lands home when the auth service is not configured", async () => {
    deleteUserSession.mockResolvedValue({ idToken: "id.tok.en" });
    getAuthConfig.mockImplementation(() => {
      throw new Error("AUTH_ISSUER is not set");
    });

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(cookieSet).toHaveBeenCalledWith(SECURE_NAME, "", CLEARED);
  });

  it("clears the cookie and lands home when the row is already gone", async () => {
    deleteUserSession.mockResolvedValue(null);

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(cookieSet).toHaveBeenCalledWith(SECURE_NAME, "", CLEARED);
  });

  it("clears the cookie with no database call when there is no cookie", async () => {
    cookieJar.clear();

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(deleteUserSession).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledWith(SECURE_NAME, "", CLEARED);
  });

  // Only the spelling this origin writes is read, so a planted bare cookie
  // cannot aim the delete at somebody else's row.
  it("never deletes the row a planted bare cookie names", async () => {
    cookieJar.clear();
    cookieJar.set("authjs.session-token", "planted");

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(deleteUserSession).not.toHaveBeenCalled();
  });

  it("uses the bare spelling on a plain-HTTP origin", async () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    cookieJar.clear();
    cookieJar.set("authjs.session-token", "tok");

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(deleteUserSession).toHaveBeenCalledWith("tok");
    expect(cookieSet).toHaveBeenCalledWith("authjs.session-token", "", {
      ...CLEARED,
      secure: false,
    });
  });

  // The repo has no error.tsx, so an unhandled throw here would hand the
  // app's only sign-out affordance a raw error page. The cookie is kept:
  // without it Proxy would bounce /profile to sign-in before the banner
  // shows, the row would stay live, and a retry would have nothing to delete.
  it("keeps the cookie and reports a database failure on /profile", async () => {
    deleteUserSession.mockRejectedValue(new Error("connection reset"));

    await expect(signOutAction()).rejects.toThrow(
      "NEXT_REDIRECT:/profile?error=signout-failed",
    );
    expect(cookieSet).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
