/**
 * Basketball's play library and the playbook a coach picks from it.
 *
 * The library is code, not data: a fixed, seeded set of common youth plays,
 * each drawn as a handful of frames on the half court. A team's playbook is
 * only the ids the coach chose (`Team.playbook`, at most `MAX_PLAYBOOK_PLAYS`),
 * so a play is improved for every team at once by editing it here, and a play
 * removed from the library simply drops out of every playbook on read
 * (`resolvePlaybook`) rather than stranding a row.
 *
 * Pure and DB-free like the rest of `src/lib/`, and free of the Prisma runtime
 * so the client-side animation can import it.
 *
 * Coordinates are in **feet** on the same half court `court-geometry.ts`
 * draws: x runs 0–50 across the baseline, y runs 0 (the baseline, basket at
 * the top) to 47 (the half-court line). `court-geometry`'s eight units to the
 * foot turns them into SVG units.
 */

/// The most plays a coach can put in a team's playbook. Youth teams run a
/// handful of sets; five is the cap Brian asked for, and the action enforces
/// it — the form's disabled checkboxes are a convenience, never the boundary.
export const MAX_PLAYBOOK_PLAYS = 5;

export type CourtPoint = { x: number; y: number };

/// One moment of a play: where each of the five offensive players stands, and
/// who has the ball. Frame 0 is the set; every later frame is the result of
/// one action, which its caption describes.
export type PlayFrame = {
  /// Players 1 through 5, in that order — the numbers drawn in the circles.
  players: readonly [CourtPoint, CourtPoint, CourtPoint, CourtPoint, CourtPoint];
  /// Index (0–4) into `players` of whoever holds the ball at this frame. A
  /// change between frames is a pass; the ball travels between the two.
  ball: number;
  /// What happens to get here, in a parent's words.
  caption: string;
};

export type Play = {
  /// Stable slug stored in `Team.playbook`. Never rename one: a team that
  /// chose it would silently lose it.
  id: string;
  name: string;
  /// One sentence on what the play is for.
  summary: string;
  frames: readonly PlayFrame[];
};

// Spots a youth coach draws on the whiteboard, in feet.
const TOP: CourtPoint = { x: 25, y: 30 };
const RIGHT_WING: CourtPoint = { x: 42, y: 20 };
const LEFT_WING: CourtPoint = { x: 8, y: 20 };
const RIGHT_CORNER: CourtPoint = { x: 46, y: 3 };
const LEFT_CORNER: CourtPoint = { x: 4, y: 3 };
const RIGHT_ELBOW: CourtPoint = { x: 31, y: 19 };
const LEFT_ELBOW: CourtPoint = { x: 19, y: 19 };
const RIGHT_BLOCK: CourtPoint = { x: 32, y: 8 };
const LEFT_BLOCK: CourtPoint = { x: 18, y: 8 };
const RIGHT_LAYUP: CourtPoint = { x: 28, y: 6 };
const LEFT_LAYUP: CourtPoint = { x: 22, y: 6 };
/// Just inside the baseline beside the lane — the court stops at the line, so
/// an inbounder is drawn standing on it.
const INBOUNDER: CourtPoint = { x: 37, y: 2.2 };

/// The seeded library — nine simple plays a youth team can actually run — in
/// the order the coach's picker lists it. More plays than a playbook holds, so
/// picking five is a real choice.
export const PLAY_LIBRARY: readonly Play[] = [
  {
    id: "give-and-go",
    name: "Give and Go",
    summary:
      "Pass to a teammate, cut hard to the basket, and get the ball right back for a layup.",
    frames: [
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 0,
        caption: "1 has the ball up top.",
      },
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 1,
        caption: "1 passes to 2 on the wing — the give.",
      },
      {
        players: [RIGHT_LAYUP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 1,
        caption: "1 cuts hard to the basket — the go.",
      },
      {
        players: [RIGHT_LAYUP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 0,
        caption: "2 passes it right back for the layup.",
      },
    ],
  },
  {
    id: "pick-and-roll",
    name: "Pick and Roll",
    summary:
      "A big sets a screen for the ball handler, then rolls to the basket for a pass.",
    frames: [
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_BLOCK],
        ball: 0,
        caption: "1 has the ball up top, 5 on the block.",
      },
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, { x: 21, y: 28 }],
        ball: 0,
        caption: "5 steps up and sets a screen beside 1.",
      },
      {
        players: [{ x: 33, y: 18 }, RIGHT_WING, LEFT_WING, RIGHT_CORNER, { x: 21, y: 28 }],
        ball: 0,
        caption: "1 dribbles off the screen toward the right elbow.",
      },
      {
        players: [{ x: 33, y: 18 }, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_LAYUP],
        ball: 0,
        caption: "5 rolls to the basket.",
      },
      {
        players: [{ x: 33, y: 18 }, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_LAYUP],
        ball: 4,
        caption: "1 hits 5 for the layup.",
      },
    ],
  },
  {
    id: "pass-and-cut",
    name: "Pass and Cut",
    summary:
      "The basic motion offense: pass, cut through to the basket, and everyone fills the open spot.",
    frames: [
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 0,
        caption: "Five out: 1 up top, wings and corners spread.",
      },
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 1,
        caption: "1 passes to 2 on the right wing.",
      },
      {
        players: [RIGHT_LAYUP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 1,
        caption: "1 cuts to the basket looking for the ball.",
      },
      {
        players: [LEFT_CORNER, RIGHT_WING, TOP, RIGHT_CORNER, LEFT_WING],
        ball: 1,
        caption: "No pass, so 1 fills the left corner. 3 and 5 slide up a spot.",
      },
      {
        players: [LEFT_CORNER, RIGHT_WING, TOP, RIGHT_CORNER, LEFT_WING],
        ball: 2,
        caption: "2 swings it back to 3 up top, and the motion starts again.",
      },
    ],
  },
  {
    id: "backdoor-cut",
    name: "Backdoor Cut",
    summary:
      "When a defender overplays the wing, the wing fakes out and cuts behind them to the basket.",
    frames: [
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 0,
        caption: "1 has the ball, 2 is being overplayed on the wing.",
      },
      {
        players: [TOP, { x: 39, y: 23 }, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 0,
        caption: "2 takes a step out like they want the ball.",
      },
      {
        players: [TOP, RIGHT_LAYUP, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 0,
        caption: "Then 2 plants and cuts backdoor, behind the defender.",
      },
      {
        players: [TOP, RIGHT_LAYUP, LEFT_WING, RIGHT_CORNER, LEFT_CORNER],
        ball: 1,
        caption: "1 bounce-passes to 2 for the layup.",
      },
    ],
  },
  {
    id: "box-inbounds",
    name: "Box Inbounds",
    summary:
      "Under our own basket: one player screens across so a teammate pops open right at the rim.",
    frames: [
      {
        players: [INBOUNDER, RIGHT_BLOCK, LEFT_BLOCK, RIGHT_ELBOW, LEFT_ELBOW],
        ball: 0,
        caption: "1 inbounds from the baseline. Box: 2 and 3 on the blocks, 4 and 5 at the elbows.",
      },
      {
        players: [INBOUNDER, { x: 24, y: 9 }, LEFT_BLOCK, RIGHT_ELBOW, LEFT_ELBOW],
        ball: 0,
        caption: "2 slides across the lane to screen for 3.",
      },
      {
        players: [INBOUNDER, { x: 24, y: 9 }, { x: 30, y: 4.5 }, RIGHT_ELBOW, LEFT_ELBOW],
        ball: 0,
        caption: "3 cuts off the screen to the basket, right in front of 1.",
      },
      {
        players: [INBOUNDER, { x: 24, y: 9 }, { x: 30, y: 4.5 }, { x: 38, y: 26 }, LEFT_WING],
        ball: 2,
        caption: "1 passes to 3 for the layup. 4 and 5 step out as safety valves.",
      },
    ],
  },
  {
    id: "pin-down",
    name: "Pin Down",
    summary:
      "A forward runs down to screen for a guard on the block, who pops out to the wing for the ball.",
    frames: [
      {
        players: [TOP, RIGHT_BLOCK, LEFT_WING, RIGHT_WING, LEFT_BLOCK],
        ball: 0,
        caption: "1 up top. 2 starts on the right block, 4 on the right wing.",
      },
      {
        players: [TOP, RIGHT_BLOCK, LEFT_WING, { x: 36, y: 11 }, LEFT_BLOCK],
        ball: 0,
        caption: "4 runs down and sets a screen for 2.",
      },
      {
        players: [TOP, RIGHT_WING, LEFT_WING, { x: 36, y: 11 }, LEFT_BLOCK],
        ball: 0,
        caption: "2 sprints up off the screen to the wing.",
      },
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_BLOCK, LEFT_BLOCK],
        ball: 1,
        caption: "1 passes to 2. 4 seals the defender on the block.",
      },
      {
        players: [TOP, RIGHT_WING, LEFT_WING, RIGHT_BLOCK, LEFT_BLOCK],
        ball: 3,
        caption: "2 feeds 4 inside for a short shot.",
      },
    ],
  },
  {
    id: "box-screen-up",
    name: "Box Screen Up",
    summary:
      "From a box set, the players on the blocks screen up and the bigs at the elbows pop open.",
    frames: [
      {
        players: [TOP, RIGHT_BLOCK, LEFT_BLOCK, RIGHT_ELBOW, LEFT_ELBOW],
        ball: 0,
        caption: "Box set: 1 up top, 4 and 5 at the elbows, 2 and 3 on the blocks.",
      },
      {
        players: [TOP, { x: 32, y: 13 }, { x: 18, y: 13 }, RIGHT_ELBOW, LEFT_ELBOW],
        ball: 0,
        caption: "2 and 3 step up and screen for the elbows.",
      },
      {
        players: [TOP, { x: 32, y: 13 }, { x: 18, y: 13 }, RIGHT_WING, LEFT_WING],
        ball: 0,
        caption: "4 and 5 pop out to the wings.",
      },
      {
        players: [TOP, RIGHT_BLOCK, LEFT_BLOCK, RIGHT_WING, LEFT_WING],
        ball: 3,
        caption: "1 passes to 4 on the wing; 2 and 3 roll back to the blocks.",
      },
      {
        players: [TOP, RIGHT_BLOCK, LEFT_BLOCK, RIGHT_WING, LEFT_WING],
        ball: 1,
        caption: "4 feeds 2 on the block for a short shot.",
      },
    ],
  },
  {
    id: "horns",
    name: "Horns",
    summary:
      "Two bigs at the elbows give the ball handler a screen on either side, with shooters in the corners.",
    frames: [
      {
        players: [TOP, RIGHT_CORNER, LEFT_CORNER, RIGHT_ELBOW, LEFT_ELBOW],
        ball: 0,
        caption: "Horns: 1 up top, 4 and 5 at the elbows, 2 and 3 in the corners.",
      },
      {
        players: [TOP, RIGHT_CORNER, LEFT_CORNER, { x: 29, y: 28 }, LEFT_ELBOW],
        ball: 0,
        caption: "4 steps up to screen for 1.",
      },
      {
        players: [{ x: 38, y: 14 }, RIGHT_CORNER, LEFT_CORNER, { x: 29, y: 28 }, LEFT_ELBOW],
        ball: 0,
        caption: "1 drives off the screen toward the basket.",
      },
      {
        players: [{ x: 38, y: 14 }, RIGHT_CORNER, LEFT_CORNER, { x: 29, y: 28 }, LEFT_BLOCK],
        ball: 0,
        caption: "5 dives to the block as the defense collapses.",
      },
      {
        players: [{ x: 38, y: 14 }, RIGHT_CORNER, LEFT_CORNER, { x: 29, y: 28 }, LEFT_BLOCK],
        ball: 1,
        caption: "1 kicks it out to 2 in the corner for the open shot.",
      },
    ],
  },
  {
    id: "three-lane-break",
    name: "Three-Lane Fast Break",
    summary:
      "After a rebound, fill the middle and both side lanes and race the ball up the floor.",
    frames: [
      {
        players: [{ x: 25, y: 44 }, { x: 5, y: 44 }, { x: 45, y: 44 }, { x: 16, y: 45 }, { x: 34, y: 45 }],
        ball: 0,
        caption: "We get the ball at half court: 1 in the middle, 2 and 3 on the sidelines.",
      },
      {
        players: [{ x: 25, y: 30 }, { x: 6, y: 22 }, { x: 44, y: 22 }, { x: 18, y: 42 }, { x: 32, y: 42 }],
        ball: 0,
        caption: "Everyone sprints. 2 and 3 stay wide and run ahead of the ball.",
      },
      {
        players: [{ x: 25, y: 21 }, LEFT_LAYUP, { x: 44, y: 12 }, { x: 20, y: 34 }, { x: 30, y: 34 }],
        ball: 0,
        caption: "1 stops at the free-throw line. 2 cuts in from the left lane.",
      },
      {
        players: [{ x: 25, y: 21 }, LEFT_LAYUP, { x: 44, y: 12 }, { x: 20, y: 34 }, { x: 30, y: 34 }],
        ball: 1,
        caption: "1 passes to 2 for the layup. 4 and 5 trail for the rebound.",
      },
    ],
  },
];

const PLAYS_BY_ID: ReadonlyMap<string, Play> = new Map(
  PLAY_LIBRARY.map((play) => [play.id, play]),
);

export function getPlay(id: string): Play | undefined {
  return PLAYS_BY_ID.get(id);
}

/// A stored playbook as the plays it names, in stored (library) order. Ids no
/// longer in the library are dropped, as are repeats — a stored column is
/// read as untrusted, the same as the form that wrote it.
export function resolvePlaybook(ids: readonly string[]): Play[] {
  const seen = new Set<string>();
  const plays: Play[] = [];
  for (const id of ids) {
    const play = PLAYS_BY_ID.get(id);
    if (play && !seen.has(id)) {
      seen.add(id);
      plays.push(play);
    }
  }
  return plays.slice(0, MAX_PLAYBOOK_PLAYS);
}

export type PlaybookValidation =
  | { ok: true; playIds: string[] }
  | { ok: false; reason: "unknown-play" | "duplicate-play" | "too-many-plays" };

/// The save's boundary: every id is in the library, none repeats, and there
/// are no more than `MAX_PLAYBOOK_PLAYS`. The ids come back in **library**
/// order, whatever order they were sent in, so the playbook reads the same way
/// the picker lists it.
export function validatePlaybook(ids: readonly string[]): PlaybookValidation {
  if (ids.length > MAX_PLAYBOOK_PLAYS) {
    return { ok: false, reason: "too-many-plays" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "duplicate-play" };
  }
  if (ids.some((id) => !PLAYS_BY_ID.has(id))) {
    return { ok: false, reason: "unknown-play" };
  }
  const chosen = new Set(ids);
  return {
    ok: true,
    playIds: PLAY_LIBRARY.filter((play) => chosen.has(play.id)).map(
      (play) => play.id,
    ),
  };
}

/// Whether two stored playbooks hold the same plays in the same order — the
/// lost-update check, exactly as the chart editors compare a baseline.
export function samePlaybook(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

// ── Animation ──────────────────────────────────────────────────────────────

/// Seconds spent moving from one frame to the next.
export const PLAY_MOVE_SECONDS = 1.2;
/// Seconds each frame holds still before the next action, so a parent can
/// read the caption.
export const PLAY_HOLD_SECONDS = 1.3;

const STEP_SECONDS = PLAY_MOVE_SECONDS + PLAY_HOLD_SECONDS;

/// One full loop of a play: a hold on the set, a move and a hold for every
/// later frame, then a move back to the set — so the loop walks everyone back
/// into place instead of snapping them there in one frame.
export function playDurationSeconds(play: Play): number {
  return (
    PLAY_HOLD_SECONDS + (play.frames.length - 1) * STEP_SECONDS + PLAY_MOVE_SECONDS
  );
}

export type PlaySnapshot = {
  players: CourtPoint[];
  ball: CourtPoint;
  /// The frame whose caption is showing: the one being moved toward, or held.
  frameIndex: number;
};

function lerp(a: CourtPoint, b: CourtPoint, t: number): CourtPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/// Ease in and out, so a cut starts and stops like a kid running rather than
/// a conveyor belt.
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/// Where everyone is `seconds` into the loop. Pure, so the animation is the
/// thing tested rather than a timer: the component only asks this per frame.
///
/// A held ball rides with its holder. A pass leaves the passer's spot at the
/// start of the move and lands in the receiver's hands at its end, so the ball
/// is in the air for the whole move and is always caught where the receiver
/// is standing.
export function playSnapshot(play: Play, seconds: number): PlaySnapshot {
  const { frames } = play;
  const loop = playDurationSeconds(play);
  const t = ((seconds % loop) + loop) % loop;

  const at = (index: number): PlaySnapshot => {
    const frame = frames[index];
    return {
      players: [...frame.players],
      ball: frame.players[frame.ball],
      frameIndex: index,
    };
  };

  if (frames.length === 1 || t < PLAY_HOLD_SECONDS) {
    return at(0);
  }

  const afterSet = t - PLAY_HOLD_SECONDS;
  const lastHoldEnds = (frames.length - 1) * STEP_SECONDS;
  if (afterSet >= lastHoldEnds) {
    // The walk back to the set. The ball goes back to the set's holder the
    // same way a pass would, and the caption is the set's again.
    const last = frames[frames.length - 1];
    const first = frames[0];
    const progress = ease(Math.min((afterSet - lastHoldEnds) / PLAY_MOVE_SECONDS, 1));
    const players = last.players.map((point, index) =>
      lerp(point, first.players[index], progress),
    );
    const ball =
      last.ball === first.ball
        ? players[first.ball]
        : lerp(last.players[last.ball], first.players[first.ball], progress);
    return { players, ball, frameIndex: 0 };
  }

  const step = Math.min(Math.floor(afterSet / STEP_SECONDS), frames.length - 2);
  const within = afterSet - step * STEP_SECONDS;
  if (within >= PLAY_MOVE_SECONDS) {
    return at(step + 1);
  }

  const from = frames[step];
  const to = frames[step + 1];
  const progress = ease(within / PLAY_MOVE_SECONDS);
  const players = from.players.map((point, index) =>
    lerp(point, to.players[index], progress),
  );
  const ball =
    from.ball === to.ball
      ? players[to.ball]
      : lerp(from.players[from.ball], to.players[to.ball], progress);

  return { players, ball, frameIndex: step + 1 };
}

/// The moment in the loop at which frame `index` has just arrived and is
/// holding — where the step buttons jump to.
export function frameHoldSeconds(play: Play, index: number): number {
  const clamped = Math.max(0, Math.min(index, play.frames.length - 1));
  return clamped === 0 ? 0 : PLAY_HOLD_SECONDS + (clamped - 1) * STEP_SECONDS + PLAY_MOVE_SECONDS;
}
