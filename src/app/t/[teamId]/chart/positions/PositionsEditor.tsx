"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import {
  DIAMOND_GEOMETRY,
  positionPercent,
} from "@/components/diamond-geometry";
import { FieldArt } from "@/components/FieldArt";
import { buildDiamondNames } from "@/lib/diamond-names";
import {
  NO_CATCHER_TEXT,
  NoCatcherMarker,
} from "@/components/NoCatcherMarker";
import { RSVP_STYLE } from "@/components/rsvp-style";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
import type { Position } from "@/generated/prisma/enums";
import {
  buildPositionsDraft,
  nextDroppableId,
  POSITION_POOL_ID,
  positionOf,
  resolvePositionDrop,
  samePositions,
  storedPositions,
  type PositionsDraft,
} from "@/lib/chart";
import { POSITION_LABELS } from "@/lib/positions";

import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from "../drag-activation";
import { savePositionsAction } from "./actions";
import { stashDraft } from "../draft-stash";

/// The editor's slice of a roster entry. RSVP state is deliberately absent, and
/// stays absent after #55: who declined arrives as `declinedEntryIds` beside
/// these rows, never on them. `buildPositionsDraft` and `resolvePositionDrop`
/// consume entries, so keeping the two apart is what makes "the assignable pool
/// cannot be filtered by who has replied" structural rather than a promise (#7).
export type PositionsEditorEntry = {
  entryId: string;
  playerName: string;
  jerseyNumber: number | null;
  position: Position | null;
};

type PositionsEditorProps = {
  teamId: string;
  allPlay: boolean;
  entries: PositionsEditorEntry[];
  /// Roster spots whose player has declined the next game (#55). Decoration
  /// only: it badges a chip and touches nothing else — not the draft, not the
  /// drop rules, not what gets posted. A declined player stays as draggable and
  /// as placeable as anyone else, because the chart is standing and one
  /// Saturday's absence is not a reason to rewrite it (Decision 16).
  ///
  /// Empty when no game is on the schedule, which is what keeps this board
  /// identical to the one that existed before the badges.
  declinedEntryIds?: readonly string[];
};


/**
 * Drag players onto the diamond (#11). A thin shell over the pure draft logic
 * in src/lib/chart.ts: every drag outcome is `resolvePositionDrop`, tested
 * there, because jsdom cannot simulate a real pointer drag.
 *
 * No Motion imports here, ever: dnd-kit positions drags by writing
 * `transform`, and Motion's `layout` prop animates `transform` too — together
 * a dragged chip lags the finger or snaps back (AGENTS.md).
 *
 * No autosave: edits live in local state until the explicit Save posts them,
 * and Cancel restores the board the page loaded.
 */
export function PositionsEditor({
  teamId,
  allPlay,
  entries,
  declinedEntryIds = [],
}: PositionsEditorProps) {
  const original = useMemo(
    () => buildPositionsDraft(entries, allPlay),
    [entries, allPlay],
  );
  const [draft, setDraft] = useState<PositionsDraft>(original);

  const byId = useMemo(
    () => new Map(entries.map((entry) => [entry.entryId, entry])),
    [entries],
  );

  const declined = useMemo(
    () => new Set(declinedEntryIds),
    [declinedEntryIds],
  );

  // Where the keyboard drag currently "hovers". A ref, not state: the
  // coordinate getter runs during dnd-kit's own event handling and must not
  // trigger a render to read its own last answer.
  const keyboardTarget = useRef<string>(POSITION_POOL_ID);

  const coordinateGetter: KeyboardCoordinateGetter = (
    event,
    { currentCoordinates, context },
  ) => {
    const step =
      event.code === "ArrowRight" || event.code === "ArrowDown"
        ? 1
        : event.code === "ArrowLeft" || event.code === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) {
      return undefined;
    }
    event.preventDefault();

    const next = nextDroppableId(draft.positions, keyboardTarget.current, step);
    const targetRect = context.droppableRects.get(next);
    const activeRect = context.active?.rect.current.translated;
    if (!targetRect || !activeRect) {
      return undefined;
    }
    keyboardTarget.current = next;

    // Align centres rather than corners, so the collision pass below finds the
    // target whatever the two elements' relative sizes are.
    return {
      x:
        currentCoordinates.x +
        (targetRect.left + targetRect.width / 2) -
        (activeRect.left + activeRect.width / 2),
      y:
        currentCoordinates.y +
        (targetRect.top + targetRect.height / 2) -
        (activeRect.top + activeRect.height / 2),
    };
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  // Two different questions, and on an allPlay team with a stale named-outfield
  // row they have different answers on the very first render: the board matches
  // the one that loaded (nothing to cancel) while the database still says
  // CENTER_FIELD (something to save). Gating both on `edited` would disable the
  // only button that collapses that row.
  const stored = useMemo(() => storedPositions(entries), [entries]);

  // Computed over the whole roster, exactly as the view page's diamond does
  // (#49): two Avas must read "Ava C." and "Ava R." on *both* boards, or the
  // coach is disambiguating on the screen where the mistake gets written while
  // the parents see it resolved on the screen where it only gets read.
  const diamondNames = useMemo(
    () =>
      buildDiamondNames(
        entries.map((entry) => ({
          id: entry.entryId,
          playerName: entry.playerName,
        })),
      ),
    [entries],
  );
  const edited = !samePositions(draft.assigned, original.assigned);
  const saveable = !samePositions(draft.assigned, stored);

  function handleDragStart({ active }: DragStartEvent) {
    keyboardTarget.current =
      positionOf(draft, String(active.id)) ?? POSITION_POOL_ID;
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraft((current) =>
      resolvePositionDrop(
        current,
        String(active.id),
        over ? String(over.id) : null,
      ),
    );
  }

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin gives the gesture a coach expects: a drop on empty grass
      // hits no target and cancels, where closestCenter would snap it to the
      // nearest base. It returns nothing for keyboard drags (no pointer), so
      // rectIntersection covers those.
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Zone above the diamond, deliberately. It is where every player
            starts and where the coach's thumb returns between drags, so on a
            phone it belongs above the fold rather than below a 400x520 board
            the coach has to scroll past to reach it. */}
        <Zone
          draft={draft}
          byId={byId}
          allPlay={allPlay}
          declined={declined}
        />
        <Field
          draft={draft}
          byId={byId}
          diamondNames={diamondNames}
          declined={declined}
        />

        <form
          action={savePositionsAction}
          className="flex items-center justify-end gap-2"
          // Same reasoning as the batting editor: a chart-changed rejection
          // discards this component, so the board goes out as text first.
          // POSITION_LABELS is the only source of position abbreviations
          // (AGENTS.md), so the stash reads the way the diamond does.
          onSubmit={() =>
            stashDraft(
              teamId,
              "positions",
              Object.entries(draft.assigned).map(
                ([position, entryId]) =>
                  `${POSITION_LABELS[position as Position]} — ${
                    byId.get(entryId as string)?.playerName ?? "—"
                  }`,
              ),
            )
          }
        >
          <input type="hidden" name="teamId" value={teamId} />
          <input
            type="hidden"
            name="positions"
            value={JSON.stringify(draft.assigned)}
          />
          {/* The board this page loaded. The action compares it against a
              fresh read and refuses the save if another coach moved anyone in
              the meantime — the write replaces the whole chart, so without
              this it would erase their work silently. */}
          <input type="hidden" name="baseline" value={JSON.stringify(stored)} />
          <Button
            type="button"
            variant="outline"
            disabled={!edited}
            onClick={() => setDraft(original)}
          >
            Cancel
          </Button>
          {/* Footer, not a chip: dnd-kit owns the dragged markers and this
              button is outside that tree entirely (AGENTS.md's collision rule).
              `saveable` compares the draft against the stored chart and stays
              the resting reason to be disabled. */}
          <SubmitButton disabled={!saveable} pendingLabel="Saving…">
            Save positions
          </SubmitButton>
        </form>
      </div>
    </DndContext>
  );
}

const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0
    ? pointerCollisions
    : rectIntersection(args);
};

/// The diamond: an SVG outline with absolutely positioned HTML drop targets on
/// top. The targets are HTML because dnd-kit measures with
/// `getBoundingClientRect` and moves chips with CSS `transform`; mixing in SVG
/// coordinate space buys nothing and breaks measurement.
function Field({
  draft,
  byId,
  diamondNames,
  declined,
}: {
  draft: PositionsDraft;
  byId: Map<string, PositionsEditorEntry>;
  diamondNames: ReadonlyMap<string, string>;
  declined: ReadonlySet<string>;
}) {
  // An allPlay board has no catcher. The spot is still drawn — as the disc
  // that says nobody plays it — so the coach isn't left wondering whether the
  // target failed to render.
  const noCatcher = !draft.positions.includes("CATCHER");

  return (
    <section aria-label="Diamond">
      <div
        className="relative mx-auto w-full max-w-sm"
        style={{
          aspectRatio: `${DIAMOND_GEOMETRY.width} / ${DIAMOND_GEOMETRY.height}`,
        }}
      >
        <svg
          viewBox={`0 0 ${DIAMOND_GEOMETRY.width} ${DIAMOND_GEOMETRY.height}`}
          aria-hidden="true"
          focusable="false"
          className="absolute inset-0 h-full w-full"
        >
          {/* Same painted field as the view page — FieldArt draws the chalk
              basepaths the bare polygon used to be. Background only: the drop
              targets stay HTML, dnd-kit measurement is untouched. */}
          <FieldArt />
          {noCatcher ? <NoCatcherMarker /> : null}
        </svg>

        {noCatcher ? <p className="sr-only">{NO_CATCHER_TEXT}</p> : null}

        {draft.positions.map((position) => (
          <PositionTarget
            key={position}
            position={position}
            entry={
              draft.assigned[position] !== undefined
                ? byId.get(draft.assigned[position])
                : undefined
            }
            diamondNames={diamondNames}
            declined={declined}
          />
        ))}
      </div>
    </section>
  );
}

function PositionTarget({
  position,
  entry,
  diamondNames,
  declined,
}: {
  position: Position;
  entry: PositionsEditorEntry | undefined;
  /// Marker labels for the whole roster, keyed by playerId. Passed in rather
  /// than shortened here because "is this first name ambiguous" is a question
  /// about every other player on the board, not about this one.
  diamondNames: ReadonlyMap<string, string>;
  declined: ReadonlySet<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: position });
  const { x, y } = positionPercent(position);

  return (
    <div
      ref={setNodeRef}
      data-position={position}
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-md border-2 p-1 text-center ${
        // A chalk box on the grass. The box itself stays unfilled: targets are
        // 80px wide but neighbours like SS and 2B stand only 64px apart, so a
        // filled box turns that overlap into two visibly stacked slabs. The
        // label carries its own backing instead, which is also what keeps it
        // readable over grass and dirt.
        isOver
          ? "border-banana bg-banana/25"
          : "border-dashed border-chalk/80"
      }`}
    >
      <span className="rounded bg-background/85 px-1 text-[11px] font-bold text-foreground">
        {POSITION_LABELS[position]}
      </span>
      {entry !== undefined ? (
        <Chip
          entry={entry}
          label={diamondNames.get(entry.entryId) ?? entry.playerName}
          declined={declined.has(entry.entryId)}
          stacked
        />
      ) : (
        <span className="rounded bg-background/85 px-1 text-[11px] italic text-muted-foreground">
          Open
        </span>
      )}
    </div>
  );
}

/// The outfield (allPlay) or the bench (not allPlay). Both persist as
/// `position = null` — the label is the only difference, and it matters: on an
/// allPlay team nobody sits.
function Zone({
  draft,
  byId,
  allPlay,
  declined,
}: {
  draft: PositionsDraft;
  byId: Map<string, PositionsEditorEntry>;
  allPlay: boolean;
  declined: ReadonlySet<string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POSITION_POOL_ID });
  // "Substitutes", never "Bench": the app-wide word for the state, chosen
  // because a parent reads it too — the coach's zone here and the family's
  // pages must not speak two dialects of the same idea.
  const title = allPlay ? "Outfield" : "Substitutes";
  const empty = allPlay
    ? "Drag a player here to move them to the outfield."
    : "Drag a player here to make them a substitute.";

  return (
    <section aria-label={title}>
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h4>
      <div
        ref={setNodeRef}
        className={`flex min-h-16 flex-wrap gap-2 rounded-md border-2 border-dashed p-3 ${
          isOver ? "border-banana bg-banana/20" : "border-border"
        }`}
      >
        {draft.pool.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          draft.pool.map((entryId) => {
            const entry = byId.get(entryId);
            return entry !== undefined ? (
              <Chip
                key={entryId}
                entry={entry}
                label={entry.playerName}
                showJersey
                declined={declined.has(entryId)}
              />
            ) : null;
          })
        )}
      </div>
    </section>
  );
}

/// A draggable player. Chips are draggable only, never droppable — the drop
/// target under a seated player is the position box around them, so a drop
/// always resolves to a position rather than to whoever happens to be standing
/// there.
function Chip({
  entry,
  label,
  showJersey = false,
  declined = false,
  stacked = false,
}: {
  entry: PositionsEditorEntry;
  label: string;
  showJersey?: boolean;
  /// True when this player has declined the team's next game (#55). Says so
  /// and does nothing else — the chip stays draggable and the drop rules never
  /// see this.
  declined?: boolean;
  /// True for a chip seated on the diamond, where neighbouring position boxes
  /// stand as little as 64px apart (see PositionTarget's own comment) and an
  /// inline "Not going" tag would widen the chip past the next spot. Stacks
  /// the tag under the name instead of beside it — trading width the board
  /// doesn't have for height the chalk box already grows into freely. The zone
  /// wraps and has the room, so it stays inline.
  stacked?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.entryId });

  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      className={`inline-flex cursor-grab touch-manipulation select-none rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm ${
        stacked ? "flex-col items-center gap-0.5" : "items-center gap-1"
      } ${isDragging ? "z-10 cursor-grabbing opacity-80 shadow-md" : ""}`}
    >
      {label}
      {showJersey && entry.jerseyNumber !== null ? (
        <span className="text-muted-foreground">#{entry.jerseyNumber}</span>
      ) : null}
      {/* The next game's decline, in the app's one RSVP vocabulary — a label
          and a colour, never colour alone (design-plan.md §10). The name keeps
          full strength: fading it would read as "disabled" on a chip that is
          fully draggable.

          Static markup on a dnd-kit element, deliberately. No Motion, no
          animation class — dnd-kit owns `transform` here (AGENTS.md). */}
      {declined ? (
        <span className={`font-semibold ${RSVP_STYLE.declined.tagClassName}`}>
          {RSVP_STYLE.declined.label}
        </span>
      ) : null}
    </span>
  );
}
