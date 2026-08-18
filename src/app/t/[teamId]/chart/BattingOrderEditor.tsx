"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSwappingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { JerseyDot } from "@/components/JerseyDot";
import { Button } from "@/components/ui/button";
import {
  buildBattingDraft,
  emptySlotId,
  resolveDrop,
  sameOrder,
  storedBattingOrder,
  UNASSIGNED_ID,
  type BattingDraft,
} from "@/lib/chart";

import { saveBattingOrderAction } from "./actions";
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from "./drag-activation";

/// The editor's slice of a roster entry — chart-view's render model minus the
/// fields this page doesn't show. RSVP state is deliberately absent: the
/// editor never loads RSVPs at all, so it structurally cannot filter by them.
export type ChartEditorEntry = {
  entryId: string;
  playerName: string;
  jerseyNumber: number | null;
  battingOrder: number | null;
};

type BattingOrderEditorProps = {
  teamId: string;
  allPlay: boolean;
  entries: ChartEditorEntry[];
};

/**
 * Drag-and-drop batting order (#10). A thin shell over the pure draft logic
 * in src/lib/chart.ts — every drag outcome is `resolveDrop`, tested there;
 * this component owns only sensors, markup, and one piece of state.
 *
 * No Motion imports here, ever: dnd-kit positions drags by writing
 * `transform`, and Motion's `layout` prop animates `transform` too — together
 * a dragged item lags the finger or snaps back (AGENTS.md). dnd-kit's own
 * `transition` handles drag settling.
 *
 * No autosave: edits live in local state until the explicit Save posts them.
 * Cancel restores the order the page loaded.
 */
export function BattingOrderEditor({
  teamId,
  allPlay,
  entries,
}: BattingOrderEditorProps) {
  const original = useMemo(
    () => buildBattingDraft(entries, allPlay),
    [entries, allPlay],
  );
  const [draft, setDraft] = useState<BattingDraft>(original);

  const byId = useMemo(
    () => new Map(entries.map((entry) => [entry.entryId, entry])),
    [entries],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Two different questions, the same split the positions editor makes. They
  // diverge on the first render whenever `buildBattingDraft` had to normalize:
  // turn allPlay off on a team whose twelve players were all batting and the
  // draft seats nine, benching three into the pool — the board already shows
  // the change, so nothing is "edited", while the database still bats all
  // twelve and the parents' view page still lists them. Gating Save on
  // `edited` leaves the coach looking at a change they cannot commit.
  //
  // Empty slots drop out because the write does the same: `validateBattingOrder`
  // numbers seated entries by slot position, so a gap renumbers rather than
  // persisting. That also makes a pure renumber (a hand-set 1, 2, 5 the save
  // would compact to 1, 2, 3) correctly *not* saveable — same players, same
  // order, nothing a coach or a parent could see.
  const stored = useMemo(() => storedBattingOrder(entries), [entries]);
  const seated = draft.slots.filter((entryId) => entryId !== null);
  const edited = !sameOrder(draft.slots, original.slots);
  const saveable = !sameOrder(seated, stored);

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDraft((current) =>
      resolveDrop(current, String(active.id), over ? String(over.id) : null),
    );
  }

  const slotItems = draft.slots.map((entryId, index) => entryId ?? emptySlotId(index));

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        <section>
          <SortableContext items={slotItems} strategy={rectSwappingStrategy}>
            <ol aria-label="Batting order" className="space-y-2">
              {draft.slots.map((entryId, index) => (
                <SlotItem
                  key={slotItems[index]}
                  id={slotItems[index]}
                  slotNumber={index + 1}
                  entry={entryId !== null ? byId.get(entryId) : undefined}
                />
              ))}
            </ol>
          </SortableContext>
        </section>

        {!allPlay ? <UnassignedPool draft={draft} byId={byId} /> : null}

        <form
          action={saveBattingOrderAction}
          className="flex items-center justify-end gap-2"
        >
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="order" value={JSON.stringify(draft.slots)} />
          {/* The order this page loaded. The action compares it against a
              fresh read and refuses the save if another coach reordered in the
              meantime — the write replaces the whole order, so without this it
              would erase their work silently. */}
          <input type="hidden" name="baseline" value={JSON.stringify(stored)} />
          <Button
            type="button"
            variant="outline"
            disabled={!edited}
            onClick={() => setDraft(original)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!saveable}>
            Save order
          </Button>
        </form>
      </div>
    </DndContext>
  );
}

function SlotItem({
  id,
  slotNumber,
  entry,
}: {
  id: string;
  slotNumber: number;
  entry: ChartEditorEntry | undefined;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id,
    // Empty slots are drop targets but can't be picked up themselves.
    disabled: { draggable: entry === undefined, droppable: false },
  });

  // An empty slot is a drop target only. Spreading dnd-kit's draggable
  // attributes onto it would put `role="button" tabindex="0"
  // aria-roledescription="sortable"` on a thing that does nothing when
  // activated — a dead tab stop between every pair of real players.
  const draggableProps = entry !== undefined ? { ...attributes, ...listeners } : {};

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...draggableProps}
      className={`flex touch-manipulation select-none items-center gap-3 rounded-md border p-3 ${
        entry !== undefined
          ? "border-border bg-card cursor-grab shadow-sm"
          : "border-2 border-dashed border-border bg-muted/30"
      } ${isDragging ? "z-10 opacity-80 shadow-md cursor-grabbing" : ""} ${
        isOver && !isDragging ? "ring-2 ring-banana" : ""
      }`}
    >
      {/* Static styling only on a dnd-kit element — no Motion, ever. */}
      <JerseyDot
        number={slotNumber}
        className={entry === undefined ? "opacity-40" : ""}
      />
      {entry !== undefined ? (
        <PlayerLabel entry={entry} />
      ) : (
        <span className="text-sm text-muted-foreground">Empty slot</span>
      )}
    </li>
  );
}

function UnassignedPool({
  draft,
  byId,
}: {
  draft: BattingDraft;
  byId: Map<string, ChartEditorEntry>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: UNASSIGNED_ID });

  return (
    <section aria-label="Not batting">
      <h4 className="mb-2 text-sm font-medium text-muted-foreground">
        Not batting
      </h4>
      <div
        ref={setNodeRef}
        className={`min-h-16 space-y-2 rounded-md border-2 border-dashed p-3 ${
          isOver ? "border-banana bg-banana/20" : "border-border"
        }`}
      >
        {draft.unassigned.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Drag a player here to take them out of the order.
          </p>
        ) : (
          draft.unassigned.map((entryId) => {
            const entry = byId.get(entryId);
            return entry !== undefined ? (
              <PoolItem key={entryId} entry={entry} />
            ) : null;
          })
        )}
      </div>
    </section>
  );
}

function PoolItem({ entry }: { entry: ChartEditorEntry }) {
  // useDraggable, not useSortable — pool items sit outside the slot list's
  // SortableContext and are not drop targets, so a drag over the pool always
  // resolves to the pool container itself.
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.entryId });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform) }}
      {...attributes}
      {...listeners}
      className={`flex touch-manipulation select-none items-center gap-3 rounded-md border border-border bg-background p-3 cursor-grab ${
        isDragging ? "z-10 opacity-80 shadow-md cursor-grabbing" : ""
      }`}
    >
      <PlayerLabel entry={entry} />
    </div>
  );
}

function PlayerLabel({ entry }: { entry: ChartEditorEntry }) {
  return (
    <span className="text-sm font-medium text-foreground">
      {entry.playerName}
      {entry.jerseyNumber !== null ? (
        <span className="text-muted-foreground"> #{entry.jerseyNumber}</span>
      ) : null}
    </span>
  );
}
