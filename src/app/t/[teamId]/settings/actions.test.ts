import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTeamAccess = vi.fn();
const updateTeam = vi.fn();
const archiveTeam = vi.fn();
const unarchiveTeam = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/team-access", () => ({
  requireTeamAccess: (...args: unknown[]) => requireTeamAccess(...args),
  TeamAccessError: class TeamAccessError extends Error {},
}));

vi.mock("@/lib/teams", () => ({
  updateTeam: (...args: unknown[]) => updateTeam(...args),
  archiveTeam: (...args: unknown[]) => archiveTeam(...args),
  unarchiveTeam: (...args: unknown[]) => unarchiveTeam(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

// redirect() throws in Next; reproduce that so control flow matches
// production — same setup as the chart and roster actions tests.
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
import { updateTeamAction } from "./actions";
import { TEAM_SETTINGS_INITIAL_STATE } from "./team-settings-state";

const VALID_LINK = "https://groupme.com/join_group/12345678/AbCdEfGh";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("teamId", "team-1");
  data.set("name", "Sharks");
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

function save(fields: Record<string, string>) {
  return updateTeamAction(TEAM_SETTINGS_INITIAL_STATE, form(fields));
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
  requireTeamAccess.mockResolvedValue({ role: "OWNER", userId: "user-1" });
  updateTeam.mockResolvedValue(undefined);
});

describe("updateTeamAction on a good submission", () => {
  it("writes the values and redirects with a save confirmation", async () => {
    const url = await redirectUrlOf(
      save({ season: "2027", allPlay: "on", groupMeUrl: VALID_LINK }),
    );

    expect(requireTeamAccess).toHaveBeenCalledWith("team-1", {
      intent: "write",
      minRole: "OWNER",
    });
    expect(updateTeam).toHaveBeenCalledWith("team-1", {
      name: "Sharks",
      season: "2027",
      allPlay: true,
      groupMeUrl: VALID_LINK,
    });
    expect(url).toBe("/t/team-1/settings?saved=1");
  });

  it("clears the GroupMe link when the field is submitted empty", async () => {
    await redirectUrlOf(save({ season: "", groupMeUrl: "" }));

    expect(updateTeam).toHaveBeenCalledWith("team-1", {
      name: "Sharks",
      season: null,
      allPlay: false,
      groupMeUrl: null,
    });
  });

  it("trims a pasted link before storing it", async () => {
    await redirectUrlOf(save({ season: "", groupMeUrl: `  ${VALID_LINK}  ` }));

    expect(updateTeam).toHaveBeenCalledWith(
      "team-1",
      expect.objectContaining({ groupMeUrl: VALID_LINK }),
    );
  });
});

describe("updateTeamAction on a rejected submission", () => {
  it("returns the GroupMe failure without writing, keeping what was typed", async () => {
    const state = await save({
      season: "2027",
      allPlay: "on",
      groupMeUrl: "https://example.com/chat",
    });

    expect(updateTeam).not.toHaveBeenCalled();
    expect(state).toEqual({
      status: "invalid",
      code: "invalid-groupme",
      field: "groupMeUrl",
      values: {
        name: "Sharks",
        season: "2027",
        allPlay: true,
        groupMeUrl: "https://example.com/chat",
      },
    });
  });

  it("rejects a groupme.com page that is not an invite link", async () => {
    const state = await save({ groupMeUrl: "https://web.groupme.com/chats" });

    expect(state).toMatchObject({ code: "invalid-groupme" });
  });

  it("returns the name failure for an empty name", async () => {
    const state = await save({ name: "   ", groupMeUrl: "" });

    expect(state).toMatchObject({ code: "invalid-name", field: "name" });
  });

  // The precedence the form is read in. Reporting the link first meant an
  // empty name hid behind it and only surfaced on a second submit.
  it("reports the name before the link when both are bad", async () => {
    const state = await save({ name: "", groupMeUrl: "nonsense" });

    expect(state).toMatchObject({ code: "invalid-name", field: "name" });
  });

  it("never reaches the access check on a bad value", async () => {
    await save({ groupMeUrl: "nonsense" });

    expect(requireTeamAccess).not.toHaveBeenCalled();
  });
});

describe("updateTeamAction when access is lost", () => {
  it("redirects rather than returning state", async () => {
    requireTeamAccess.mockRejectedValue(new TeamAccessError("archived", "archived"));

    const url = await redirectUrlOf(save({ groupMeUrl: VALID_LINK }));

    expect(updateTeam).not.toHaveBeenCalled();
    expect(url).toBe("/t/team-1/settings?error=access");
  });
});
