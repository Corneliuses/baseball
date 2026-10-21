"use client";

import { useMemo, useState, type ReactNode } from "react";
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
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { CourtArt } from "@/components/CourtArt";
import {
  COURT_GEOMETRY,
  courtSpotPercent,
} from "@/components/court-geometry";
import { RSVP_STYLE } from "@/components/rsvp-style";
import { SubmitButton } from "@/components/SubmitButton";
import { Button } from "@/components/ui/button";
import type { CourtPosition } from "@/generated/prisma/enums";
import {
  COURT_POSITIONS,
  COURT_POSITION_LABELS,
  COURT_POSITION_NAMES,
  ordinal,
} from "@/lib/court-positions";
import {
  BENCH_ID,
  benchSlotId,
  boardOf,
  buildDepthDraft,
  courtSpotId,
  resolveDepthDrop,
  sameDepth,
  type DepthChartEntry,
  type DepthDraft,
} from "@/lib/depth-chart";
import { buildDiamondNames } from "@/lib/diamond-names";

import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from "../drag-activation";
import { stashDraft } from "../draft-stash";
import { saveDepthChartAction } from "./actions";

type DepthChartEditorProps = {
  teamId: string;
  /// The roster in jersey-then-name order. RSVP state is deliberately absent:
  /// who declined arrives as `declinedEntryIds` beside these rows, never on
  /// them, so the board cannot be filtered by who replied — the same
  /// separation the baseball editors keep (AGENTS.md).
  entries: DepthChartEntry[];
  declinedEntryIds?: readonly string[];
};

/**
 * Drag players onto the half court. A thin shell over the pure draft logic in
 * src/lib/depth-chart.ts: every drag outcome is `resolveDepthDrop`, tested
 * there, because jsdom cannot simulate a real pointer drag.
 *
 * Five starting spots on the court, one player each; dropping onto a starter
 * swaps the two. The bench is an ordered line above the court, and every
 * bench chip is its own drop target, so dropping onto someone takes their
 * place in line; the strip at the end of the line sends a player to the back.
 *
 * No Motion imports, for the same reason as the baseball editors: dnd-kit owns
 * `transform` on everything that drags. No autosave either; Save posts the
 * board and Cancel restores the one the page loaded.
 */
export function DepthChartEditor({
  teamId,
  entries,
  declinedEntryIds = [],
}: DepthChartEditorProps) {
  const original = useMemo(() => buildDepthDraft(entries), [entries]);
  const [draft, setDraft] = useState<DepthDraft>(original);

  const byId = useMemo(
    () => new Map(entries.map((entry) => [entry.entryId, entry])),
    [entries],
  );
  const declined = useMemo(() => new Set(declinedEntryIds), [declinedEntryIds]);
  const names = useMemo(
    () =>
      buildDiamondNames(
        entries.map((entry) => ({ id: entry.entryId, playerName: entry.playerName })),
      ),
    [entries],
  );

  // The loaded board doubles as the save's baseline: `buildDepthDraft` is
  // deterministic for the roster order the page hands over, and the action
  // rebuilds it the same way from a fresh read.
  //
  // Save is "has anything changed", and so is Cancel — except that a kid the
  // coach has never placed (a new roster add, or every kid on a team with no
  // chart yet) is unsaved even untouched, since the stored bench has no slot
  // for them. Saving then writes the bench the coach is looking at.
  const loaded = useMemo(() => boardOf(original), [original]);
  const board = boardOf(draft);
  const edited = !sameDepth(board, loaded);
  const unnumbered = entries.some(
    (entry) => entry.courtPosition === null && entry.benchOrder === null,
  );
  const saveable = edited || unnumbered;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraft((current) =>
      resolveDepthDrop(current, String(active.id), over ? String(over.id) : null),
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        <Bench draft={draft} byId={byId} declined={declined} />

        <section aria-label="Half court">
          <div
            className="relative mx-auto w-full max-w-sm"
            style={{
              aspectRatio: `${COURT_GEOMETRY.width} / ${COURT_GEOMETRY.height}`,
            }}
          >
            <svg
              viewBox={`0 0 ${COURT_GEOMETRY.width} ${COURT_GEOMETRY.height}`}
              aria-hidden="true"
              focusable="false"
              className="absolute inset-0 h-full w-full"
            >
              <CourtArt />
            </svg>
            {COURT_POSITIONS.map((position) => {
              const entryId = draft.starters[position];
              return (
                <Spot
                  key={position}
                  position={position}
                  entry={entryId !== null ? byId.get(entryId) : undefined}
                  names={names}
                  declined={declined}
                />
              );
            })}
          </div>
        </section>

        <form
          action={saveDepthChartAction}
          className="flex items-center justify-end gap-2"
          onSubmit={() =>
            stashDraft(
              teamId,
              "depth",
              [
                ...COURT_POSITIONS.flatMap((position) => {
                  const entryId = draft.starters[position];
                  return entryId === null
                    ? []
                    : [
                        `${COURT_POSITION_LABELS[position]} — ${byId.get(entryId)?.playerName ?? "—"}`,
                      ];
                }),
                ...draft.bench.map(
                  (entryId, index) =>
                    `Bench ${ordinal(index + 1)} — ${byId.get(entryId)?.playerName ?? "—"}`,
                ),
              ],
            )
          }
        >
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="depth" value={JSON.stringify(board)} />
          {/* The board this page loaded. The save replaces the whole chart, so
              the action refuses it if another coach saved in the meantime. */}
          <input type="hidden" name="baseline" value={JSON.stringify(loaded)} />
          <Button
            type="button"
            variant="outline"
            disabled={!edited}
            onClick={() => setDraft(original)}
          >
            Cancel
          </Button>
          <SubmitButton disabled={!saveable} pendingLabel="Saving…">
            Save depth chart
          </SubmitButton>
        </form>
      </div>
    </DndContext>
  );
}

const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

function Spot({
  position,
  entry,
  names,
  declined,
}: {
  position: CourtPosition;
  entry: DepthChartEntry | undefined;
  names: ReadonlyMap<string, string>;
  declined: ReadonlySet<string>;
}) {
  const { x, y } = courtSpotPercent(position);
  const { setNodeRef, isOver } = useDroppable({ id: courtSpotId(position) });

  return (
    <div
      ref={setNodeRef}
      data-court-position={position}
      aria-label={COURT_POSITION_NAMES[position]}
      role="group"
      style={{ left: `${x}%`, top: `${y}%` }}
      className={`absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-md border-2 p-1 text-center ${
        isOver ? "border-banana bg-banana/30" : "border-dashed border-court-line/80"
      }`}
    >
      <span className="rounded-full bg-foreground px-2 font-mono text-[11px] font-bold text-background">
        {COURT_POSITION_LABELS[position]}
      </span>
      {entry ? (
        <Chip
          entry={entry}
          label={names.get(entry.entryId) ?? entry.playerName}
          declined={declined.has(entry.entryId)}
          starter
        />
      ) : (
        <span className="rounded bg-background/85 px-1 text-[11px] italic text-muted-foreground">
          Open
        </span>
      )}
    </div>
  );
}

function Bench({
  draft,
  byId,
  declined,
}: {
  draft: DepthDraft;
  byId: Map<string, DepthChartEntry>;
  declined: ReadonlySet<string>;
}) {
  return (
    <section aria-label="Bench">
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">
        Bench, in order
      </h4>
      <ol className="space-y-1.5 rounded-md border-2 border-dashed border-border p-2">
        {draft.bench.map((entryId, index) => {
          const entry = byId.get(entryId);
          return entry !== undefined ? (
            <BenchSlot key={entryId} index={index}>
              <span className="w-8 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                {ordinal(index + 1)}
              </span>
              <Chip
                entry={entry}
                label={entry.playerName}
                showJersey
                declined={declined.has(entryId)}
              />
            </BenchSlot>
          ) : null;
        })}
        <BenchEnd empty={draft.bench.length === 0} />
      </ol>
    </section>
  );
}

function BenchSlot({ index, children }: { index: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: benchSlotId(index) });
  return (
    <li
      ref={setNodeRef}
      data-bench-slot={index}
      className={`flex items-center gap-2 rounded px-1 py-0.5 ${
        isOver ? "bg-banana/30 ring-2 ring-banana" : ""
      }`}
    >
      {children}
    </li>
  );
}

/// The end of the line: drop here to go to the back of the bench (or, with
/// nobody on it, onto the bench at all).
function BenchEnd({ empty }: { empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: BENCH_ID });
  return (
    <li
      ref={setNodeRef}
      className={`rounded px-2 py-2 text-xs text-muted-foreground ${
        isOver ? "bg-banana/30 ring-2 ring-banana" : "bg-muted/40"
      }`}
    >
      {empty
        ? "Everyone is starting. Drag a player here to put them on the bench."
        : "Drop here for the end of the bench."}
    </li>
  );
}

function Chip({
  entry,
  label,
  showJersey = false,
  declined = false,
  starter = false,
}: {
  entry: DepthChartEntry;
  label: string;
  showJersey?: boolean;
  /// Declined the next game. Says so and nothing else: the chip stays
  /// draggable and the drop rules never see it.
  declined?: boolean;
  starter?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.entryId });

  return (
    <span
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      className={`inline-flex max-w-full cursor-grab touch-manipulation select-none flex-col items-center rounded border border-border bg-card px-1.5 text-foreground shadow-sm ${
        starter ? "py-0.5 text-xs font-semibold" : "text-[10px] font-medium"
      } ${isDragging ? "z-10 cursor-grabbing opacity-80 shadow-md" : ""}`}
    >
      <span className="max-w-full truncate">
        {label}
        {showJersey && entry.jerseyNumber !== null ? (
          <span className="ml-1 text-muted-foreground">#{entry.jerseyNumber}</span>
        ) : null}
      </span>
      {declined ? (
        <span className={`font-semibold ${RSVP_STYLE.declined.tagClassName}`}>
          {RSVP_STYLE.declined.label}
        </span>
      ) : null}
    </span>
  );
}
