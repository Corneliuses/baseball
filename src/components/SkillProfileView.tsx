import {
  BALL_RADIUS_FT,
  WALL_DEPTH,
  type ArmPose,
  type Hand,
  type Skill,
  type SkillSnapshot,
} from "@/lib/skills";

/// The same box as the top view, so the two drawings sit side by side at the
/// same size.
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 300;
/// The narrowest stretch of floor drawn, in feet, so a close-up drill still
/// has room for a kid standing up — and a wall drill room for the tape mark.
const MIN_SPAN = 10;
const WALL_SPAN = 11;
/// Room beyond the outermost kid, ball or cone, for arms and feet.
const PROFILE_MARGIN = 1.5;
/// The floor line sits this far up from the bottom edge, in feet.
const FLOOR_GAP = 0.5;

// A kid of about four and a half feet, in feet.
const HIP_HEIGHT = 2.3;
const TORSO = 1.4;
const NECK = 0.25;
const HEAD_R = 0.38;
const SHOULDER_HALF = 0.45;
const ARM_REACH = 2;

type Point = { x: number; y: number };

/**
 * The second drawing of a skill: the kid as a stick figure from the front or
 * from the side (`skill.profile`), driven by the same `skillSnapshot` as the
 * top view so the two move together under one caption.
 *
 * - **Front** stands where the wall or cone would be and looks back at the
 *   kid, so the kid's right hand is on the viewer's left, as in real life.
 *   A ball behind the kid (around the back, between the legs from behind) is
 *   drawn behind the figure.
 * - **Side** stands at the kid's right and looks across: the wall, when there
 *   is one, is on the left, and a ball on the kid's left side is drawn behind
 *   the figure.
 *
 * What only this view shows is height: how low the stance is, a dribble
 * bouncing to the floor, a shot climbing to the tape mark.
 */
export function SkillProfileView({
  skill,
  snapshot,
}: {
  skill: Skill;
  snapshot: SkillSnapshot;
}) {
  const { scene, profile } = skill;
  const front = profile === "front";

  // The horizontal axis, in feet. Front: across the scene, mirrored. Side:
  // depth from the wall (or the top of the scene), which is screen-left.
  const axis = (point: { x: number; y: number }) =>
    front ? scene.width - point.x : point.y;
  const { start, span } = profileWindow(skill, axis);
  const ft = VIEW_WIDTH / span;
  const sx = (a: number) => (a - start) * ft;
  // Heights go up from the floor line.
  const sy = (height: number) => VIEW_HEIGHT - (FLOOR_GAP + height) * ft;
  const floorY = sy(0);

  const body = poseFigure(snapshot, front, axis(snapshot.kid));
  const ball =
    snapshot.ball && snapshot.ballHeight !== null
      ? { x: axis(snapshot.ball), y: snapshot.ballHeight }
      : null;
  // Behind the figure from this viewpoint?
  const ballBehind =
    snapshot.ball !== null &&
    (front
      ? snapshot.ball.y > snapshot.kid.y + 0.2
      : snapshot.ball.x < snapshot.kid.x - 0.2);

  // Arms: to the ball for each hand on it, otherwise the frame's free pose.
  const handTarget = (hand: Hand, shoulder: Point): Point => {
    if (ball && snapshot.hands.includes(hand)) {
      return reach(shoulder, ball, ARM_REACH);
    }
    return freeHand(snapshot.arms, hand, shoulder, front, body.facing);
  };

  const line = (a: Point, b: Point, key: string, width = 0.16) => (
    <line
      key={key}
      x1={sx(a.x)}
      y1={sy(a.y)}
      x2={sx(b.x)}
      y2={sy(b.y)}
      className="stroke-foreground"
      strokeWidth={width * ft}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  const ballMark = ball ? (
    <circle
      cx={sx(ball.x)}
      cy={sy(ball.y)}
      r={BALL_RADIUS_FT * ft}
      className="fill-primary stroke-background"
      strokeWidth={2.5}
      data-profile-ball=""
    />
  ) : null;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      focusable="false"
      className="h-full w-full"
      data-skill-profile={profile}
    >
      <rect
        x={0}
        y={0}
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        rx={6}
        className="fill-muted"
      />
      <rect
        x={0}
        y={floorY}
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT - floorY}
        className="fill-hardwood"
      />

      {scene.wall && !front ? (
        <g data-wall="">
          <rect
            x={0}
            y={0}
            width={WALL_DEPTH * ft}
            height={floorY}
            className="fill-court-paint"
          />
          <rect
            x={WALL_DEPTH * ft - 5}
            y={sy(scene.wall.spotHeight) - 0.45 * ft}
            width={5}
            height={0.9 * ft}
            className="fill-court-line"
            data-spot=""
          />
        </g>
      ) : null}

      {(scene.cones ?? []).map((cone, index) => {
        const x = sx(axis(cone));
        const h = 0.9 * ft;
        const w = 0.4 * ft;
        return (
          <path
            key={index}
            d={`M ${x - w} ${floorY} L ${x} ${floorY - h} L ${x + w} ${floorY} Z`}
            className="fill-court-paint stroke-court-line"
            strokeWidth={2}
            strokeLinejoin="round"
            data-cone=""
          />
        );
      })}

      {ballBehind ? ballMark : null}

      <g data-profile-kid="">
        {line(body.hip, body.leftKnee, "lk")}
        {line(body.leftKnee, body.leftFoot, "lf")}
        {line(body.hip, body.rightKnee, "rk")}
        {line(body.rightKnee, body.rightFoot, "rf")}
        {line(body.hip, body.neck, "torso", 0.22)}
        {line(body.leftShoulder, handTarget("left", body.leftShoulder), "la")}
        {line(body.rightShoulder, handTarget("right", body.rightShoulder), "ra")}
        <circle
          cx={sx(body.head.x)}
          cy={sy(body.head.y)}
          r={HEAD_R * ft}
          className="fill-card stroke-foreground"
          strokeWidth={0.08 * ft}
        />
      </g>

      {ballBehind ? null : ballMark}
    </svg>
  );
}

/// The stretch of the horizontal axis to draw: a wall drill from the wall
/// out, anything else just wide enough for everything the skill moves
/// through, plus a margin, and never narrower than `MIN_SPAN` — so the kid is
/// drawn as big as the drill allows.
function profileWindow(
  skill: Skill,
  axis: (point: { x: number; y: number }) => number,
): { start: number; span: number } {
  if (skill.scene.wall) {
    return { start: 0, span: WALL_SPAN };
  }
  const values = [
    ...skill.frames.flatMap((frame) =>
      frame.ball ? [axis(frame.kid), axis(frame.ball)] : [axis(frame.kid)],
    ),
    ...(skill.scene.cones ?? []).map(axis),
  ];
  const low = Math.min(...values) - PROFILE_MARGIN;
  const high = Math.max(...values) + PROFILE_MARGIN;
  const span = Math.max(MIN_SPAN, high - low);
  return { start: (low + high) / 2 - span / 2, span };
}

type Figure = {
  /// +1 when the kid faces screen-right, -1 screen-left (side view only; the
  /// front view faces the viewer and uses 0).
  facing: number;
  hip: Point;
  neck: Point;
  head: Point;
  leftShoulder: Point;
  rightShoulder: Point;
  leftKnee: Point;
  rightKnee: Point;
  leftFoot: Point;
  rightFoot: Point;
};

/// The stick figure's joints, in profile feet (x along the view's axis, y up
/// from the floor), for a kid standing at `center` with the snapshot's
/// crouch. A lower crouch drops the hips, widens the feet (front) or sits the
/// hips back and leans the shoulders forward (side).
function poseFigure(snapshot: SkillSnapshot, front: boolean, center: number): Figure {
  const c = Math.max(0, Math.min(1, snapshot.crouch));
  const hipY = HIP_HEIGHT - 0.7 * c;
  const kneeY = hipY * 0.5;

  if (front) {
    // The kid's right is the viewer's left: a smaller x.
    const foot = 0.45 + 0.45 * c;
    const knee = 0.4 + 0.55 * c;
    const hip = { x: center, y: hipY };
    const neck = { x: center, y: hipY + TORSO };
    return {
      facing: 0,
      hip,
      neck,
      head: { x: center, y: neck.y + NECK + HEAD_R },
      rightShoulder: { x: center - SHOULDER_HALF, y: neck.y - 0.1 },
      leftShoulder: { x: center + SHOULDER_HALF, y: neck.y - 0.1 },
      rightKnee: { x: center - knee, y: kneeY },
      leftKnee: { x: center + knee, y: kneeY },
      rightFoot: { x: center - foot, y: 0 },
      leftFoot: { x: center + foot, y: 0 },
    };
  }

  // Side: facing the wall, which is screen-left.
  const facing = -1;
  const hip = { x: center - facing * 0.3 * c, y: hipY };
  const lean = 0.45 * c;
  const neck = { x: hip.x + facing * lean, y: hipY + TORSO * (1 - 0.1 * c) };
  const knee = { x: center + facing * 0.35 * c, y: kneeY };
  const shoulder = { x: neck.x, y: neck.y - 0.1 };
  return {
    facing,
    hip,
    neck,
    head: { x: neck.x + facing * 0.1, y: neck.y + NECK + HEAD_R },
    rightShoulder: shoulder,
    leftShoulder: shoulder,
    rightKnee: { x: knee.x + facing * 0.12, y: knee.y },
    leftKnee: { x: knee.x - facing * 0.12, y: knee.y },
    rightFoot: { x: center + facing * 0.35, y: 0 },
    leftFoot: { x: center - facing * 0.35, y: 0 },
  };
}

/// Toward `target`, but no further than an arm's length.
function reach(from: Point, target: Point, length: number): Point {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= length) {
    return target;
  }
  return { x: from.x + (dx / distance) * length, y: from.y + (dy / distance) * length };
}

/// A hand with nothing in it.
function freeHand(
  pose: ArmPose,
  hand: Hand,
  shoulder: Point,
  front: boolean,
  facing: number,
): Point {
  // Front: the kid's right hand reaches toward the viewer's left.
  const outward = front ? (hand === "right" ? -1 : 1) : facing;
  switch (pose) {
    case "up":
      // The right hand goes up (the shooting hand, or the closeout's high
      // hand); the left stays out.
      if (hand === "right") {
        return { x: shoulder.x + (front ? 0 : facing * 0.4), y: shoulder.y + ARM_REACH };
      }
      return { x: shoulder.x + outward * 1.1, y: shoulder.y - 0.6 };
    case "forward":
      return front
        ? { x: shoulder.x + outward * 0.35, y: shoulder.y - 0.1 }
        : { x: shoulder.x + facing * ARM_REACH * 0.9, y: shoulder.y };
    case "out":
    default:
      return front
        ? { x: shoulder.x + outward * 1.2, y: shoulder.y - 0.9 }
        : { x: shoulder.x + facing * 1, y: shoulder.y - 0.9 };
  }
}
