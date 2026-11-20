/**
 * Basketball's at-home skills library and the handful a coach picks from it.
 *
 * The playbook's twin (`plays.ts`), for a kid on their own with a ball and no
 * hoop: in a driveway, a basement, or against the garage wall. The library is
 * code, not data — each skill is a few frames of one kid (and their ball) on
 * a patch of floor — and a team's pick is only ids (`Team.skills`, at most
 * `MAX_TEAM_SKILLS`). Improving a skill here improves it for every team; a
 * skill removed from the library drops out of every team's list on read
 * (`resolveSkills`) rather than stranding a row. The id rules are shared with
 * the playbook in `library-selection.ts`.
 *
 * Pure and DB-free, and free of the Prisma runtime so the client-side
 * animation can import it.
 *
 * Coordinates are in **feet**, seen from above: x runs across the scene from
 * 0 to `scene.width`, y runs from 0 at the top edge (the wall, when the skill
 * has one) down to `sceneHeight(scene)`. The kid always faces the top of the
 * scene — the wall, or the cone standing in for an opponent — so "left" and
 * "right" in a caption are the kid's left and right as a parent sees them.
 */

import {
  resolveSelection,
  sameSelection,
  validateSelection,
} from "@/lib/library-selection";

/// The most skills a coach can give a team. The same cap as the playbook,
/// for the same reason: a short list a family actually works through. The
/// action enforces it — the picker's disabled checkboxes are a convenience.
export const MAX_TEAM_SKILLS = 5;

export type FloorPoint = { x: number; y: number };

export type Hand = "left" | "right";

/// One moment of a skill. Frame 0 is the starting position; every later frame
/// is the result of one movement, which its caption describes.
export type SkillFrame = {
  /// Where the kid is standing (the middle of their shoulders).
  kid: FloorPoint;
  /// Where the ball is, or absent for a skill done without one.
  ball?: FloorPoint;
  /// Which hands are on the ball at this frame. Empty while it is loose — on
  /// its way to the wall, bouncing, or in the air.
  hands: readonly Hand[];
  /// What to do to get here, in a kid's words.
  caption: string;
};

export type SkillScene = {
  /// Width of the patch of floor drawn, in feet. Ball-handling skills are a
  /// close-up; footwork skills need room to move. The height follows from
  /// `SCENE_ASPECT`.
  width: number;
  /// A wall along the top edge, with a tape mark at `spotX` to aim at.
  wall?: { spotX: number };
  /// Cones standing on the floor.
  cones?: readonly FloorPoint[];
};

export type Skill = {
  /// Stable slug stored in `Team.skills`. Never rename one: a team that chose
  /// it would silently lose it.
  id: string;
  name: string;
  /// One sentence on what the skill builds.
  summary: string;
  /// What a family needs besides the kid.
  equipment: string;
  scene: SkillScene;
  frames: readonly SkillFrame[];
};

/// Height over width of every scene, so every skill card is the same shape.
export const SCENE_ASPECT = 3 / 4;

export function sceneHeight(scene: SkillScene): number {
  return scene.width * SCENE_ASPECT;
}

/// How deep the wall band is drawn, and so where a ball touching it sits.
export const WALL_DEPTH = 0.5;
export const BALL_RADIUS_FT = 0.4;
const ON_WALL_Y = WALL_DEPTH + BALL_RADIUS_FT;

const BOTH: readonly Hand[] = ["left", "right"];
const RIGHT: readonly Hand[] = ["right"];
const LEFT: readonly Hand[] = ["left"];
const NONE: readonly Hand[] = [];

/// A point relative to a kid: `dx` to their right, `dy` toward their back
/// (negative is in front of them).
function at(kid: FloorPoint, dx: number, dy: number): FloorPoint {
  return { x: kid.x + dx, y: kid.y + dy };
}

// Close-up skills stand the kid in the middle of a 7 ft scene.
const CLOSE: FloorPoint = { x: 3.5, y: 3.2 };

/// The seeded library — nine skills a kid can practice with no hoop — in the
/// order the coach's picker lists it. More than a team's list holds, so
/// picking five is a real choice.
export const SKILL_LIBRARY: readonly Skill[] = [
  {
    id: "defensive-slides",
    name: "Defensive Slides",
    summary:
      "Shuffle side to side in a low stance without crossing your feet — the footwork that keeps you in front of the player you're guarding.",
    equipment: "Two cones, shoes or water bottles about 10 feet apart.",
    scene: { width: 16, cones: [{ x: 2.5, y: 6 }, { x: 13.5, y: 6 }] },
    frames: [
      {
        kid: { x: 3.5, y: 6.6 },
        hands: NONE,
        caption: "Get in your stance by the left cone: feet wide, knees bent, hands out.",
      },
      {
        kid: { x: 8, y: 6.6 },
        hands: NONE,
        caption: "Slide right. Push off your left foot and step with your right — never cross your feet.",
      },
      {
        kid: { x: 12.5, y: 6.6 },
        hands: NONE,
        caption: "Keep sliding, staying low, and touch the right cone.",
      },
      {
        kid: { x: 8, y: 6.6 },
        hands: NONE,
        caption: "Slide back the other way. Stay low — your head shouldn't bob up and down.",
      },
    ],
  },
  {
    id: "one-hand-control",
    name: "One-Hand Ball Control",
    summary:
      "Move the ball into one hand and back again, so it feels at home on your fingertips on either side.",
    equipment: "A ball.",
    scene: { width: 7 },
    frames: [
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, -1),
        hands: BOTH,
        caption: "Hold the ball out in front of you with both hands.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0.75, -1.05),
        hands: RIGHT,
        caption: "Let go with your left hand. Hold it on your right fingertips, not your palm.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0.95, -2.1),
        hands: RIGHT,
        caption: "Reach it out as far as you can, still in one hand.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, -1),
        hands: BOTH,
        caption: "Bring it back in and catch it with both hands.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, -0.95, -2.1),
        hands: LEFT,
        caption: "Now your left hand: take it on your fingertips and reach it out.",
      },
    ],
  },
  {
    id: "wall-backspin",
    name: "Backspin Wall Shots",
    summary:
      "Shoot at a spot on the wall and snap your wrist so the ball spins back to you — the follow-through of a real shot, no hoop needed.",
    equipment: "A ball, a wall, and a piece of tape for the spot.",
    scene: { width: 10, wall: { spotX: 5 } },
    frames: [
      {
        kid: { x: 5, y: 5.4 },
        ball: { x: 5.4, y: 4.6 },
        hands: BOTH,
        caption: "Stand a few big steps from the wall. Ball on your shooting hand, guide hand on the side.",
      },
      {
        kid: { x: 5, y: 5.4 },
        ball: { x: 5, y: ON_WALL_Y },
        hands: NONE,
        caption: "Shoot at the spot. Flick your wrist so the ball spins backward.",
      },
      {
        kid: { x: 5, y: 5.4 },
        ball: { x: 5.4, y: 4.6 },
        hands: BOTH,
        caption: "The backspin brings it back to you. Catch it in your shooting pocket.",
      },
      {
        kid: { x: 5, y: 6.6 },
        ball: { x: 5.4, y: 5.8 },
        hands: BOTH,
        caption: "Hit the spot five times in a row? Take one step back and keep going.",
      },
    ],
  },
  {
    id: "around-the-waist",
    name: "Around the Waist",
    summary:
      "Wrap the ball around your body from hand to hand, so you can move it without looking at it.",
    equipment: "A ball.",
    scene: { width: 7 },
    frames: [
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, -1),
        hands: BOTH,
        caption: "Start with the ball in front of you in both hands. Eyes up.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 1.15, 0),
        hands: RIGHT,
        caption: "Swing it around to your right side with your right hand.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, 1),
        hands: BOTH,
        caption: "Hand it off behind your back, right hand to left.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, -1.15, 0),
        hands: LEFT,
        caption: "Bring it around your left side and back to the front. Ten times, then go the other way.",
      },
    ],
  },
  {
    id: "figure-eight",
    name: "Figure Eight",
    summary:
      "Weave the ball around and between your legs in a figure eight, keeping it moving hand to hand.",
    equipment: "A ball.",
    scene: { width: 7 },
    frames: [
      {
        kid: CLOSE,
        ball: at(CLOSE, 0.45, -0.85),
        hands: RIGHT,
        caption: "Feet wide, knees bent. Ball in your right hand in front of you.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, 0.9),
        hands: LEFT,
        caption: "Pass it between your legs to your left hand behind you.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, -1.35, 0),
        hands: LEFT,
        caption: "Bring it around the outside of your left leg.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, -0.45, -0.85),
        hands: LEFT,
        caption: "Back to the front, still in your left hand.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, 0.9),
        hands: RIGHT,
        caption: "Between your legs again, this time to your right hand.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 1.35, 0),
        hands: RIGHT,
        caption: "Around the outside of your right leg and back to the front.",
      },
    ],
  },
  {
    id: "wall-passes",
    name: "Wall Chest Passes",
    summary:
      "Step and pass hard at a spot on the wall, then catch it with two hands as it comes back.",
    equipment: "A ball, a wall, and a piece of tape for the spot.",
    scene: { width: 10, wall: { spotX: 5 } },
    frames: [
      {
        kid: { x: 5, y: 6.2 },
        ball: { x: 5, y: 5.4 },
        hands: BOTH,
        caption: "Ball at your chest, thumbs behind it, elbows in.",
      },
      {
        kid: { x: 5, y: 5.2 },
        ball: { x: 5, y: ON_WALL_Y },
        hands: NONE,
        caption: "Step toward the wall and push the ball at the spot. Finish with your thumbs pointing down.",
      },
      {
        kid: { x: 5, y: 5.2 },
        ball: { x: 5, y: 4.4 },
        hands: BOTH,
        caption: "Hands up with your fingers spread, and catch it with two hands.",
      },
    ],
  },
  {
    id: "crossovers",
    name: "Stationary Crossovers",
    summary:
      "Bounce the ball low and quick from one hand to the other in front of you — the move that changes direction.",
    equipment: "A ball and a hard floor — a driveway or garage is perfect.",
    scene: { width: 7 },
    frames: [
      {
        kid: CLOSE,
        ball: at(CLOSE, 1.05, -0.7),
        hands: RIGHT,
        caption: "Dribble low and hard on your right side. Eyes up, not on the ball.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, -1.3),
        hands: NONE,
        caption: "Push it across your body. It bounces once in the middle, below your knees.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, -1.05, -0.7),
        hands: LEFT,
        caption: "Catch it in your left hand and dribble on your left side.",
      },
      {
        kid: CLOSE,
        ball: at(CLOSE, 0, -1.3),
        hands: NONE,
        caption: "Cross it back the same way, low and quick, to your right hand.",
      },
    ],
  },
  {
    id: "cone-weave",
    name: "Cone Weave Dribble",
    summary:
      "Dribble in and out of a line of cones, switching hands at every one so the ball stays away from the cone.",
    equipment: "A ball and three cones, shoes or water bottles in a line.",
    scene: {
      width: 12,
      cones: [{ x: 6, y: 6.6 }, { x: 6, y: 4.3 }, { x: 6, y: 2 }],
    },
    frames: [
      {
        kid: { x: 6, y: 8.2 },
        ball: { x: 6.8, y: 7.9 },
        hands: RIGHT,
        caption: "Start behind the first cone, dribbling with your right hand.",
      },
      {
        kid: { x: 7.7, y: 6.6 },
        ball: { x: 8.5, y: 6.3 },
        hands: RIGHT,
        caption: "Go around the right side of the first cone, ball on the outside.",
      },
      {
        kid: { x: 4.3, y: 4.3 },
        ball: { x: 3.5, y: 4 },
        hands: LEFT,
        caption: "Cross over to your left hand and go around the left side of the next one.",
      },
      {
        kid: { x: 7.7, y: 2 },
        ball: { x: 8.5, y: 1.7 },
        hands: RIGHT,
        caption: "Cross back to your right around the last cone. Then dribble back and do it again.",
      },
    ],
  },
  {
    id: "closeouts",
    name: "Closeouts",
    summary:
      "Sprint at a shooter, chop your feet to stop under control with a hand up, then slide to cut off the drive.",
    equipment: "One cone, shoe or water bottle to stand in for the shooter.",
    scene: { width: 12, cones: [{ x: 6, y: 1.8 }] },
    frames: [
      {
        kid: { x: 6, y: 8 },
        hands: NONE,
        caption: "Start a long way back from the cone — it's the player with the ball.",
      },
      {
        kid: { x: 6, y: 5.2 },
        hands: NONE,
        caption: "Sprint at the cone.",
      },
      {
        kid: { x: 6, y: 3.6 },
        hands: NONE,
        caption: "Chop your feet — short, quick steps — and get a hand up high.",
      },
      {
        kid: { x: 8.6, y: 3.6 },
        hands: NONE,
        caption: "They drive! Slide over to stay in front, then jog back and do it again.",
      },
    ],
  },
];

const SKILLS_BY_ID: ReadonlyMap<string, Skill> = new Map(
  SKILL_LIBRARY.map((skill) => [skill.id, skill]),
);

export function getSkill(id: string): Skill | undefined {
  return SKILLS_BY_ID.get(id);
}

/// A team's stored skills as the skills they name, in stored (library)
/// order. Ids no longer in the library are dropped, as are repeats.
export function resolveSkills(ids: readonly string[]): Skill[] {
  return resolveSelection(SKILL_LIBRARY, ids, MAX_TEAM_SKILLS);
}

export type SkillsValidation =
  | { ok: true; skillIds: string[] }
  | { ok: false; reason: "unknown-skill" | "duplicate-skill" | "too-many-skills" };

const SKILLS_REFUSALS = {
  unknown: "unknown-skill",
  duplicate: "duplicate-skill",
  "too-many": "too-many-skills",
} as const;

/// The save's boundary: every id is in the library, none repeats, and no
/// more than `MAX_TEAM_SKILLS`. Ids come back in library order.
export function validateSkills(ids: readonly string[]): SkillsValidation {
  const result = validateSelection(SKILL_LIBRARY, ids, MAX_TEAM_SKILLS);
  if (result.ok) {
    return { ok: true, skillIds: result.ids };
  }
  return { ok: false, reason: SKILLS_REFUSALS[result.reason] };
}

/// The lost-update check on the stored list.
export const sameSkills = sameSelection;

// ── Animation ──────────────────────────────────────────────────────────────

/// Seconds spent moving from one frame to the next. A little quicker than a
/// play's: most of these are one kid moving a ball a couple of feet.
export const SKILL_MOVE_SECONDS = 0.9;
/// Seconds each frame holds still, so the caption can be read.
export const SKILL_HOLD_SECONDS = 1.4;

const STEP_SECONDS = SKILL_MOVE_SECONDS + SKILL_HOLD_SECONDS;

/// One full loop: a hold on the start, a move and a hold for every later
/// frame, then a move back to the start.
export function skillDurationSeconds(skill: Skill): number {
  return (
    SKILL_HOLD_SECONDS + (skill.frames.length - 1) * STEP_SECONDS + SKILL_MOVE_SECONDS
  );
}

export type SkillSnapshot = {
  kid: FloorPoint;
  ball: FloorPoint | null;
  /// Hands on the ball right now. Mid-move that is only the hands holding it
  /// at both ends, so an arm never stretches out to a ball in flight.
  hands: readonly Hand[];
  /// The frame whose caption is showing: the one being moved toward, or held.
  frameIndex: number;
};

function lerp(a: FloorPoint, b: FloorPoint, t: number): FloorPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function between(
  from: SkillFrame,
  to: SkillFrame,
  progress: number,
  frameIndex: number,
): SkillSnapshot {
  const t = ease(progress);
  return {
    kid: lerp(from.kid, to.kid, t),
    ball: from.ball && to.ball ? lerp(from.ball, to.ball, t) : (to.ball ?? null),
    hands: from.hands.filter((hand) => to.hands.includes(hand)),
    frameIndex,
  };
}

/// Where the kid and the ball are `seconds` into the loop. Pure, so the
/// animation is the thing tested rather than a timer.
export function skillSnapshot(skill: Skill, seconds: number): SkillSnapshot {
  const { frames } = skill;
  const loop = skillDurationSeconds(skill);
  const t = ((seconds % loop) + loop) % loop;

  const hold = (index: number): SkillSnapshot => {
    const frame = frames[index];
    return {
      kid: frame.kid,
      ball: frame.ball ?? null,
      hands: frame.hands,
      frameIndex: index,
    };
  };

  if (frames.length === 1 || t < SKILL_HOLD_SECONDS) {
    return hold(0);
  }

  const afterStart = t - SKILL_HOLD_SECONDS;
  const lastHoldEnds = (frames.length - 1) * STEP_SECONDS;
  if (afterStart >= lastHoldEnds) {
    // Back to the start, under the start's caption.
    const progress = Math.min((afterStart - lastHoldEnds) / SKILL_MOVE_SECONDS, 1);
    return between(frames[frames.length - 1], frames[0], progress, 0);
  }

  const step = Math.min(Math.floor(afterStart / STEP_SECONDS), frames.length - 2);
  const within = afterStart - step * STEP_SECONDS;
  if (within >= SKILL_MOVE_SECONDS) {
    return hold(step + 1);
  }
  return between(frames[step], frames[step + 1], within / SKILL_MOVE_SECONDS, step + 1);
}

/// The moment in the loop at which frame `index` has just arrived and is
/// holding — where the step buttons jump to.
export function skillFrameHoldSeconds(skill: Skill, index: number): number {
  const clamped = Math.max(0, Math.min(index, skill.frames.length - 1));
  return clamped === 0
    ? 0
    : SKILL_HOLD_SECONDS + (clamped - 1) * STEP_SECONDS + SKILL_MOVE_SECONDS;
}
