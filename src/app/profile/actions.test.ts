import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const signOut = vi.fn();
const getCurrentUser = vi.fn();
const updateProfile = vi.fn();

vi.mock("@/auth", () => ({
  signOut: (...args: unknown[]) => signOut(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signOutAction", () => {
  // `redirectTo: "/"` is load-bearing: dropping it makes Auth.js fall back to
  // the Referer — /profile — which Proxy bounces to /signin, so the person
  // who just signed out lands on a sign-in form and concludes it failed.
  it("asks Auth.js to sign out and land on the signed-out home page", async () => {
    // The real signOut ends by throwing Next's redirect; mirror that so the
    // wrapper's unstable_rethrow path is what lets it escape.
    signOut.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/");
    });

    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });

  // The repo has no error.tsx, so an unhandled throw here would hand the
  // app's only sign-out affordance a raw error page — while still signed in.
  it("lands a failure back on /profile with an error instead of crashing", async () => {
    signOut.mockRejectedValue(new Error("RESEND_API_KEY is not set"));

    await expect(signOutAction()).rejects.toThrow(
      "NEXT_REDIRECT:/profile?error=signout-failed",
    );
    expect(console.error).toHaveBeenCalled();
  });
});
