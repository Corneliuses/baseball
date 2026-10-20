import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getCurrentUser = vi.fn();
const createTeam = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

vi.mock("@/lib/teams", () => ({
  createTeam: (...args: unknown[]) => createTeam(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

// redirect() throws in Next; reproduce that so control flow matches
// production — same setup as the settings and roster actions tests.
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

import { createTeamAction } from "./actions";
import { NEW_TEAM_INITIAL_STATE } from "./new-team-state";

const OWNER = { id: "owner-1", email: "owner@example.com", name: "Owner" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

function submit(fields: Record<string, string>) {
  return createTeamAction(NEW_TEAM_INITIAL_STATE, form(fields));
}

async function redirectUrlOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    expect(message).toContain("NEXT_REDIRECT:");
    return message.replace("NEXT_REDIRECT:", "");
  }
  throw new Error("expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OWNER_EMAIL", OWNER.email);
  getCurrentUser.mockResolvedValue(OWNER);
  createTeam.mockResolvedValue({ id: "team-9" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createTeamAction with no sport chosen", () => {
  it("returns invalid-sport with everything typed intact, and writes nothing", async () => {
    const state = await submit({ name: "Sharks", season: "2027", allPlay: "on" });

    expect(state).toEqual({
      status: "invalid",
      code: "invalid-sport",
      field: "sport",
      values: { name: "Sharks", season: "2027", sport: "", allPlay: true },
    });
    expect(createTeam).not.toHaveBeenCalled();
  });

  it("refuses a sport that is not one of the choices", async () => {
    const state = await submit({ name: "Sharks", sport: "CRICKET" });

    expect(state).toMatchObject({ status: "invalid", code: "invalid-sport" });
    expect(createTeam).not.toHaveBeenCalled();
  });

  // Topmost offender first: the name box sits above the sport radios.
  it("reports a missing name before a missing sport", async () => {
    const state = await submit({ name: "  " });

    expect(state).toMatchObject({
      status: "invalid",
      code: "invalid-name",
      field: "name",
    });
  });
});

describe("createTeamAction on a good submission", () => {
  it("passes allPlay through for a baseball team", async () => {
    const url = await redirectUrlOf(
      submit({ name: "Sharks", season: "2027", sport: "BASEBALL", allPlay: "on" }),
    );

    expect(createTeam).toHaveBeenCalledWith(
      { name: "Sharks", season: "2027", sport: "BASEBALL", allPlay: true },
      "owner-1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(url).toBe("/t/team-9");
  });

  it("records an unticked all-play box on a baseball team as false", async () => {
    await redirectUrlOf(submit({ name: "Sharks", sport: "BASEBALL" }));

    expect(createTeam).toHaveBeenCalledWith(
      { name: "Sharks", season: null, sport: "BASEBALL", allPlay: false },
      "owner-1",
    );
  });

  // The checkbox is never rendered for basketball, but a forged or stale POST
  // can still carry it; the column default applies regardless.
  it("ignores a stray allPlay=on for a basketball team", async () => {
    await redirectUrlOf(
      submit({ name: "Hoopers", sport: "BASKETBALL", allPlay: "on" }),
    );

    expect(createTeam).toHaveBeenCalledWith(
      { name: "Hoopers", season: null, sport: "BASKETBALL" },
      "owner-1",
    );
    expect(createTeam.mock.calls[0][0]).not.toHaveProperty("allPlay");
  });
});

describe("createTeamAction failures that redirect", () => {
  it("sends a non-owner to ?error=access without writing", async () => {
    getCurrentUser.mockResolvedValue({ ...OWNER, email: "coach@example.com" });

    const url = await redirectUrlOf(submit({ name: "Sharks", sport: "BASEBALL" }));

    expect(url).toBe("/t/new?error=access");
    expect(createTeam).not.toHaveBeenCalled();
  });

  it("sends a signed-out caller to ?error=access", async () => {
    getCurrentUser.mockResolvedValue(null);

    const url = await redirectUrlOf(submit({ name: "Sharks", sport: "BASEBALL" }));

    expect(url).toBe("/t/new?error=access");
  });

  it("redirects with create-failed when the write throws", async () => {
    createTeam.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const url = await redirectUrlOf(submit({ name: "Sharks", sport: "BASEBALL" }));

    expect(url).toBe("/t/new?error=create-failed");
  });
});
