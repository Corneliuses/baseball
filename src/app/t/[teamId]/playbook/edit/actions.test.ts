import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const getTeamById = vi.fn();
const getTeamPlaybook = vi.fn();
const saveTeamPlaybook = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  getTeamById: (...args: unknown[]) => getTeamById(...args),
  getTeamPlaybook: (...args: unknown[]) => getTeamPlaybook(...args),
  saveTeamPlaybook: (...args: unknown[]) => saveTeamPlaybook(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const REDIRECT_PREFIX = "NEXT_REDIRECT:";

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

import { TeamAccessError } from "@/lib/team-access";
import { savePlaybookAction } from "./actions";

function form(plays: string[], baseline: string[] = []): FormData {
  const data = new FormData();
  data.set("teamId", "team-1");
  data.set("baseline", JSON.stringify(baseline));
  for (const play of plays) {
    data.append("play", play);
  }
  return data;
}

async function redirectUrlOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(REDIRECT_PREFIX)) {
      return error.message.slice(REDIRECT_PREFIX.length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

const PAGE = "/t/team-1/playbook/edit";

beforeEach(() => {
  vi.clearAllMocks();
  requireTeamAccess.mockResolvedValue({ role: "COACH", userId: "user-1" });
  getTeamById.mockResolvedValue({ id: "team-1", sport: "BASKETBALL" });
  getTeamPlaybook.mockResolvedValue([]);
  saveTeamPlaybook.mockResolvedValue(undefined);
});

describe("savePlaybookAction", () => {
  it("checks coach write access before anything else", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    expect(await redirectUrlOf(savePlaybookAction(form(["give-and-go"])))).toBe(
      `${PAGE}?error=access`,
    );
    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "COACH",
    });
    expect(saveTeamPlaybook).not.toHaveBeenCalled();
  });

  it("saves the ticked plays in library order", async () => {
    const url = await redirectUrlOf(
      savePlaybookAction(form(["backdoor-cut", "give-and-go"])),
    );

    expect(url).toBe(`${PAGE}?saved=1`);
    expect(saveTeamPlaybook).toHaveBeenCalledWith("team-1", [
      "give-and-go",
      "backdoor-cut",
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/t/[teamId]/playbook", "page");
  });

  it("saves an empty playbook when nothing is ticked", async () => {
    getTeamPlaybook.mockResolvedValue(["horns-retired"]);

    await redirectUrlOf(savePlaybookAction(form([], ["horns-retired"])));

    expect(saveTeamPlaybook).toHaveBeenCalledWith("team-1", []);
  });

  it("refuses a sixth play, whatever the form allowed", async () => {
    const six = ["a", "b", "c", "d", "e", "f"];

    expect(await redirectUrlOf(savePlaybookAction(form(six)))).toBe(
      `${PAGE}?error=too-many-plays`,
    );
    expect(saveTeamPlaybook).not.toHaveBeenCalled();
  });

  it("refuses a play the library doesn't have", async () => {
    expect(await redirectUrlOf(savePlaybookAction(form(["nope"])))).toBe(
      `${PAGE}?error=unknown-play`,
    );
  });

  it("never writes a playbook onto a baseball team", async () => {
    getTeamById.mockResolvedValue({ id: "team-1", sport: "BASEBALL" });

    expect(await redirectUrlOf(savePlaybookAction(form(["give-and-go"])))).toBe(
      `${PAGE}?error=access`,
    );
    expect(saveTeamPlaybook).not.toHaveBeenCalled();
  });

  it("refuses to overwrite another coach's save", async () => {
    getTeamPlaybook.mockResolvedValue(["pick-and-roll"]);

    expect(await redirectUrlOf(savePlaybookAction(form(["give-and-go"], [])))).toBe(
      `${PAGE}?error=playbook-changed`,
    );
    expect(saveTeamPlaybook).not.toHaveBeenCalled();
  });

  it("refuses an unreadable baseline", async () => {
    const data = form(["give-and-go"]);
    data.set("baseline", "{not json");

    expect(await redirectUrlOf(savePlaybookAction(data))).toBe(
      `${PAGE}?error=invalid-playbook`,
    );
  });
});
