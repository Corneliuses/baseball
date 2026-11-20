import { describe, expect, it } from "vitest";

import {
  MAX_TEAM_SKILLS,
  SKILL_HOLD_SECONDS,
  SKILL_LIBRARY,
  SKILL_MOVE_SECONDS,
  getSkill,
  resolveSkills,
  sameSkills,
  sceneHeight,
  skillDurationSeconds,
  skillFrameHoldSeconds,
  skillSnapshot,
  validateSkills,
  type Skill,
} from "./skills";

describe("SKILL_LIBRARY", () => {
  it("seeds nine at-home skills, more than a team's list holds", () => {
    expect(SKILL_LIBRARY.map((skill) => skill.name)).toEqual([
      "Defensive Slides",
      "One-Hand Ball Control",
      "Backspin Wall Shots",
      "Around the Waist",
      "Figure Eight",
      "Wall Chest Passes",
      "Stationary Crossovers",
      "Cone Weave Dribble",
      "Closeouts",
    ]);
    expect(SKILL_LIBRARY.length).toBeGreaterThan(MAX_TEAM_SKILLS);
  });

  it("has unique, slug-shaped ids", () => {
    const ids = SKILL_LIBRARY.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(SKILL_LIBRARY.map((skill) => [skill.name, skill] as const))(
    "%s is drawable: two or more captioned frames, everything inside its scene",
    (_name, skill) => {
      expect(skill.frames.length).toBeGreaterThanOrEqual(2);
      expect(skill.equipment.trim()).not.toBe("");
      const width = skill.scene.width;
      const height = sceneHeight(skill.scene);
      const inside = ({ x, y }: { x: number; y: number }) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
      };
      // A skill uses a ball in every frame or in none.
      const withBall = skill.frames.filter((frame) => frame.ball).length;
      expect([0, skill.frames.length]).toContain(withBall);
      for (const frame of skill.frames) {
        expect(frame.caption.trim()).not.toBe("");
        inside(frame.kid);
        if (frame.ball) {
          inside(frame.ball);
        } else {
          expect(frame.hands).toEqual([]);
        }
      }
      for (const cone of skill.scene.cones ?? []) {
        inside(cone);
      }
    },
  );

  it.each(SKILL_LIBRARY.map((skill) => [skill.name, skill] as const))(
    "%s actually moves something between every pair of frames",
    (_name, skill) => {
      for (let i = 1; i < skill.frames.length; i++) {
        const before = skill.frames[i - 1];
        const after = skill.frames[i];
        const moved =
          before.kid.x !== after.kid.x ||
          before.kid.y !== after.kid.y ||
          before.ball?.x !== after.ball?.x ||
          before.ball?.y !== after.ball?.y;
        expect(moved, `${skill.id} frame ${i} repeats frame ${i - 1}`).toBe(true);
      }
    },
  );

  it("includes the three Brian asked for: shuffling, one-hand control, and backspin at a wall spot", () => {
    expect(getSkill("defensive-slides")?.frames.every((f) => !f.ball)).toBe(true);
    expect(
      getSkill("one-hand-control")?.frames.some((f) => f.hands.length === 1),
    ).toBe(true);
    expect(getSkill("wall-backspin")?.scene.wall).toBeDefined();
  });

  it("needs no hoop anywhere", () => {
    for (const skill of SKILL_LIBRARY) {
      const text = [skill.summary, skill.equipment, ...skill.frames.map((f) => f.caption)]
        .join(" ")
        .toLowerCase();
      expect(text, skill.id).not.toMatch(/\b(rim|basket|layup)\b/);
    }
  });
});

describe("resolveSkills", () => {
  it("keeps the stored order and drops unknown ids and repeats", () => {
    const skills = resolveSkills(["closeouts", "retired", "defensive-slides", "closeouts"]);
    expect(skills.map((skill) => skill.id)).toEqual(["closeouts", "defensive-slides"]);
  });

  it("never returns more than the cap", () => {
    expect(resolveSkills(SKILL_LIBRARY.map((skill) => skill.id))).toHaveLength(
      MAX_TEAM_SKILLS,
    );
  });
});

describe("validateSkills", () => {
  it("accepts up to five known skills and stores them in library order", () => {
    expect(validateSkills(["closeouts", "defensive-slides"])).toEqual({
      ok: true,
      skillIds: ["defensive-slides", "closeouts"],
    });
    expect(validateSkills([])).toEqual({ ok: true, skillIds: [] });
  });

  it("refuses a sixth skill, an unknown one, and a repeat", () => {
    expect(validateSkills(["a", "b", "c", "d", "e", "f"])).toEqual({
      ok: false,
      reason: "too-many-skills",
    });
    expect(validateSkills(["constructor"])).toEqual({ ok: false, reason: "unknown-skill" });
    expect(validateSkills(["closeouts", "closeouts"])).toEqual({
      ok: false,
      reason: "duplicate-skill",
    });
  });

  it("compares stored lists in order", () => {
    expect(sameSkills(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameSkills(["a", "b"], ["b", "a"])).toBe(false);
  });
});

const P = (x: number, y: number) => ({ x, y });

/// Small enough to check by hand: the kid walks 4 ft right holding the ball in
/// both hands, then throws it at the wall.
const TOY: Skill = {
  id: "toy",
  name: "Toy",
  summary: "Test skill.",
  equipment: "Nothing.",
  scene: { width: 10, wall: { spotX: 5 } },
  frames: [
    { kid: P(1, 5), ball: P(1, 4), hands: ["left", "right"], caption: "Start" },
    { kid: P(5, 5), ball: P(5, 4), hands: ["left", "right"], caption: "Walk" },
    { kid: P(5, 5), ball: P(5, 1), hands: [], caption: "Throw" },
  ],
};

describe("skillSnapshot", () => {
  const stepLength = SKILL_MOVE_SECONDS + SKILL_HOLD_SECONDS;

  it("holds the start at the top of the loop", () => {
    const snap = skillSnapshot(TOY, 0);
    expect(snap).toEqual({ kid: P(1, 5), ball: P(1, 4), hands: ["left", "right"], frameIndex: 0 });
  });

  it("moves the kid and the ball halfway at the middle of a move", () => {
    const snap = skillSnapshot(TOY, SKILL_HOLD_SECONDS + SKILL_MOVE_SECONDS / 2);
    expect(snap.frameIndex).toBe(1);
    expect(snap.kid.x).toBeCloseTo(3);
    expect(snap.ball?.x).toBeCloseTo(3);
    expect(snap.hands).toEqual(["left", "right"]);
  });

  it("lets go of the ball for the whole of a throw, so no arm reaches into the air", () => {
    const throwStart = SKILL_HOLD_SECONDS + stepLength;
    const mid = skillSnapshot(TOY, throwStart + SKILL_MOVE_SECONDS / 2);
    expect(mid.hands).toEqual([]);
    expect(mid.ball?.y).toBeCloseTo(2.5);
  });

  it("walks back to the start under the start's caption, then loops", () => {
    const loop = skillDurationSeconds(TOY);
    expect(loop).toBeCloseTo(SKILL_HOLD_SECONDS + 2 * stepLength + SKILL_MOVE_SECONDS);
    const back = skillSnapshot(TOY, loop - SKILL_MOVE_SECONDS / 2);
    expect(back.frameIndex).toBe(0);
    expect(back.kid.x).toBeCloseTo(3);
    expect(skillSnapshot(TOY, loop + 0.01)).toEqual(skillSnapshot(TOY, 0.01));
  });

  it("has no ball at all for a skill without one", () => {
    const slides = getSkill("defensive-slides")!;
    expect(skillSnapshot(slides, 2).ball).toBeNull();
  });

  it("jumps the step buttons to each frame's hold", () => {
    for (const skill of SKILL_LIBRARY) {
      skill.frames.forEach((frame, index) => {
        const snap = skillSnapshot(skill, skillFrameHoldSeconds(skill, index));
        expect(snap.frameIndex).toBe(index);
        expect(snap.kid).toEqual(frame.kid);
      });
    }
  });
});
