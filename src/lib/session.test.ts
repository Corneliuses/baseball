// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieJar = new Map<string, string>();
let forwardedProto: string | null = "https";
const findLiveSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
  headers: async () => ({
    get: (name: string) =>
      name === "x-forwarded-proto" ? forwardedProto : null,
  }),
}));

vi.mock("@/lib/sessions", () => ({
  findLiveSession: (...args: unknown[]) => findLiveSession(...args),
}));

// React's cache() only memoizes inside a server request scope; outside one it
// calls straight through, which is what lets each test see a fresh read.
import { getCurrentUser } from "./session";

const USER = { id: "user-1", email: "pat@example.com", name: "Pat" };

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  forwardedProto = "https";
  vi.stubEnv("AUTH_URL", "");
  findLiveSession.mockResolvedValue(USER);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCurrentUser", () => {
  it("is null with no session cookie, without touching the database", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findLiveSession).not.toHaveBeenCalled();
  });

  it("resolves the __Secure- cookie on an HTTPS origin", async () => {
    cookieJar.set("__Secure-authjs.session-token", "tok");

    await expect(getCurrentUser()).resolves.toEqual(USER);
    expect(findLiveSession).toHaveBeenCalledWith("tok");
  });

  it("resolves the bare cookie on a plain-HTTP origin", async () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    cookieJar.set("authjs.session-token", "tok");

    await expect(getCurrentUser()).resolves.toEqual(USER);
    expect(findLiveSession).toHaveBeenCalledWith("tok");
  });

  // A bare cookie is what a sibling subdomain or a plain-HTTP response can
  // plant; trusting it would sign a visitor in as whoever planted it.
  it("ignores a planted bare cookie on an HTTPS origin", async () => {
    cookieJar.set("authjs.session-token", "planted");

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findLiveSession).not.toHaveBeenCalled();
  });

  it("lets AUTH_URL decide over the forwarded protocol, as writers do", async () => {
    vi.stubEnv("AUTH_URL", "https://baseball.corneliuses.com");
    forwardedProto = "http";
    cookieJar.set("__Secure-authjs.session-token", "tok");

    await expect(getCurrentUser()).resolves.toEqual(USER);
  });

  it("is null when the cookie names no live row", async () => {
    cookieJar.set("__Secure-authjs.session-token", "stale");
    findLiveSession.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
