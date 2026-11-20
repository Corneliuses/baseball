import { describe, expect, it } from "vitest";

import {
  MAX_PLAYBOOK_PLAYS,
  PLAY_HOLD_SECONDS,
  PLAY_LIBRARY,
  PLAY_MOVE_SECONDS,
  frameHoldSeconds,
  getPlay,
  playDurationSeconds,
  playSnapshot,
  resolvePlaybook,
  samePlaybook,
  validatePlaybook,
  type Play,
} from "./plays";

describe("PLAY_LIBRARY", () => {
  it("seeds nine simple plays, more than a playbook holds", () => {
    expect(PLAY_LIBRARY.map((play) => play.name)).toEqual([
      "Give and Go",
      "Pick and Roll",
      "Pass and Cut",
      "Backdoor Cut",
      "Box Inbounds",
      "Pin Down",
      "Box Screen Up",
      "Horns",
      "Three-Lane Fast Break",
    ]);
    expect(PLAY_LIBRARY.length).toBeGreaterThan(MAX_PLAYBOOK_PLAYS);
  });

  it("has unique, slug-shaped ids", () => {
    const ids = PLAY_LIBRARY.map((play) => play.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(PLAY_LIBRARY.map((play) => [play.name, play] as const))(
    "%s is drawable: two or more frames, five players on the half court, a real ball holder",
    (_name, play) => {
      expect(play.frames.length).toBeGreaterThanOrEqual(2);
      for (const frame of play.frames) {
        expect(frame.players).toHaveLength(5);
        expect(Number.isInteger(frame.ball)).toBe(true);
        expect(frame.ball).toBeGreaterThanOrEqual(0);
        expect(frame.ball).toBeLessThan(5);
        expect(frame.caption.trim()).not.toBe("");
        for (const { x, y } of frame.players) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(50);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(47);
        }
      }
    },
  );

  it.each(PLAY_LIBRARY.map((play) => [play.name, play] as const))(
    "%s actually moves something between every pair of frames",
    (_name, play) => {
      for (let i = 1; i < play.frames.length; i++) {
        const before = play.frames[i - 1];
        const after = play.frames[i];
        const moved =
          before.ball !== after.ball ||
          before.players.some(
            (p, index) => p.x !== after.players[index].x || p.y !== after.players[index].y,
          );
        expect(moved, `${play.id} frame ${i} repeats frame ${i - 1}`).toBe(true);
      }
    },
  );
});

describe("resolvePlaybook", () => {
  it("keeps the stored order and drops unknown ids and repeats", () => {
    const plays = resolvePlaybook([
      "backdoor-cut",
      "retired-play",
      "give-and-go",
      "backdoor-cut",
    ]);
    expect(plays.map((play) => play.id)).toEqual(["backdoor-cut", "give-and-go"]);
  });

  it("never returns more than the cap, even from a column written around the action", () => {
    const ids = PLAY_LIBRARY.map((play) => play.id);
    expect(resolvePlaybook(ids)).toHaveLength(MAX_PLAYBOOK_PLAYS);
  });
});

describe("validatePlaybook", () => {
  it("accepts up to five known plays and stores them in library order", () => {
    const result = validatePlaybook(["backdoor-cut", "give-and-go"]);
    expect(result).toEqual({ ok: true, playIds: ["give-and-go", "backdoor-cut"] });
  });

  it("accepts an empty playbook", () => {
    expect(validatePlaybook([])).toEqual({ ok: true, playIds: [] });
  });

  it("refuses a sixth play", () => {
    // Six ids, whatever they are: the cap is checked before anything else.
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(validatePlaybook(six)).toEqual({ ok: false, reason: "too-many-plays" });
  });

  it("refuses an id the library doesn't have", () => {
    expect(validatePlaybook(["give-and-go", "nope"])).toEqual({
      ok: false,
      reason: "unknown-play",
    });
  });

  it("refuses a repeated id rather than quietly collapsing it", () => {
    expect(validatePlaybook(["give-and-go", "give-and-go"])).toEqual({
      ok: false,
      reason: "duplicate-play",
    });
  });

  it("does not treat Object.prototype members as plays", () => {
    expect(validatePlaybook(["constructor"])).toEqual({
      ok: false,
      reason: "unknown-play",
    });
  });
});

describe("samePlaybook", () => {
  it("compares ids in order", () => {
    expect(samePlaybook(["a", "b"], ["a", "b"])).toBe(true);
    expect(samePlaybook(["a", "b"], ["b", "a"])).toBe(false);
    expect(samePlaybook(["a"], ["a", "b"])).toBe(false);
    expect(samePlaybook([], [])).toBe(true);
  });
});

describe("getPlay", () => {
  it("finds a play by id", () => {
    expect(getPlay("pick-and-roll")?.name).toBe("Pick and Roll");
    expect(getPlay("missing")).toBeUndefined();
  });
});

const P = (x: number, y: number) => ({ x, y });

/// A two-step play small enough to check by hand: player 1 runs 10 ft right
/// while holding the ball, then passes to player 2 who is standing still.
const TOY: Play = {
  id: "toy",
  name: "Toy",
  summary: "Test play.",
  frames: [
    { players: [P(0, 0), P(20, 0), P(0, 10), P(0, 20), P(0, 30)], ball: 0, caption: "Set" },
    { players: [P(10, 0), P(20, 0), P(0, 10), P(0, 20), P(0, 30)], ball: 0, caption: "Run" },
    { players: [P(10, 0), P(20, 0), P(0, 10), P(0, 20), P(0, 30)], ball: 1, caption: "Pass" },
  ],
};

describe("playSnapshot", () => {
  const moveStart = PLAY_HOLD_SECONDS;
  const stepLength = PLAY_MOVE_SECONDS + PLAY_HOLD_SECONDS;

  it("holds the set at the start of the loop", () => {
    const snap = playSnapshot(TOY, 0);
    expect(snap.frameIndex).toBe(0);
    expect(snap.players[0]).toEqual(P(0, 0));
    expect(snap.ball).toEqual(P(0, 0));
  });

  it("moves a player halfway at the middle of a move, and the ball rides with its holder", () => {
    const snap = playSnapshot(TOY, moveStart + PLAY_MOVE_SECONDS / 2);
    expect(snap.frameIndex).toBe(1);
    expect(snap.players[0].x).toBeCloseTo(5);
    expect(snap.ball).toEqual(snap.players[0]);
  });

  it("holds each frame after its move", () => {
    const snap = playSnapshot(TOY, moveStart + PLAY_MOVE_SECONDS + 0.1);
    expect(snap.frameIndex).toBe(1);
    expect(snap.players[0]).toEqual(P(10, 0));
  });

  it("flies a pass from the passer to the receiver", () => {
    const passStart = moveStart + stepLength;
    expect(playSnapshot(TOY, passStart).ball).toEqual(P(10, 0));
    expect(playSnapshot(TOY, passStart + PLAY_MOVE_SECONDS / 2).ball.x).toBeCloseTo(15);
    expect(playSnapshot(TOY, passStart + PLAY_MOVE_SECONDS).ball).toEqual(P(20, 0));
  });

  it("loops back to the set after one full play", () => {
    const loop = playDurationSeconds(TOY);
    expect(loop).toBeCloseTo(PLAY_HOLD_SECONDS + 2 * stepLength);
    expect(playSnapshot(TOY, loop + 0.01)).toEqual(playSnapshot(TOY, 0.01));
  });

  it("ends every library play exactly on its last frame", () => {
    for (const play of PLAY_LIBRARY) {
      const last = play.frames.length - 1;
      const snap = playSnapshot(play, playDurationSeconds(play) - 0.001);
      expect(snap.frameIndex).toBe(last);
      expect(snap.players).toEqual([...play.frames[last].players]);
      expect(snap.ball).toEqual(play.frames[last].players[play.frames[last].ball]);
    }
  });
});

describe("frameHoldSeconds", () => {
  it("lands on each frame exactly, clamped to the play", () => {
    for (const play of PLAY_LIBRARY) {
      play.frames.forEach((frame, index) => {
        const snap = playSnapshot(play, frameHoldSeconds(play, index));
        expect(snap.frameIndex).toBe(index);
        expect(snap.players).toEqual([...frame.players]);
      });
      expect(frameHoldSeconds(play, -1)).toBe(0);
      expect(frameHoldSeconds(play, 99)).toBe(
        frameHoldSeconds(play, play.frames.length - 1),
      );
    }
  });
});
