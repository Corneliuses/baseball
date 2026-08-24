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
import { RSVP_STYLE } from "@/components/rsvp-style";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/SubmitButton";
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
import { stashDraft } from "./draft-stash";
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from "./drag-activation";

/// The editor's slice of a roster entry — chart-view's render model minus the
/// fields this page doesn't show. RSVP state is deliberately absent, and stays
/// absent after #55: who declined arrives as `declinedEntryIds` beside these
/// rows, never on them. The draft logic in src/lib/chart.ts consumes entries,
/// so keeping the two apart is what makes "the pool cannot be filtered by who
/// replied" structural rather than a promise.
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
  /// Roster spots whose player has declined the next game (#55). Decoration
  /// only: it badges a chip and touches nothing else — not the draft, not the
  /// drop rules, not what gets posted. A declined player is as draggable and
  /// as seatable as anyone else, because the chart is standing and Saturday's
  /// absence is not a reason to rewrite it (Decision 16).
  ///
  /// Empty when no game is on the schedule, which is what keeps this board
  /// identical to the one that existed before the badges.
  declinedEntryIds?: readonly string[];
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
  declinedEntryIds = [],
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

  const declined = useMemo(
    () => new Set(declinedEntryIds),
    [declinedEntryIds],
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
                  declined={entryId !== null && declined.has(entryId)}
                />
              ))}
            </ol>
          </SortableContext>
        </section>

        {!allPlay ? (
          <UnassignedPool draft={draft} byId={byId} declined={declined} />
        ) : null}

        <form
          action={saveBattingOrderAction}
          className="flex items-center justify-end gap-2"
          // Stash the board as text on the way out, so a `chart-changed`
          // rejection — which redirects, unmounting this component and its
          // draft — still leaves the coach something to re-apply from.
          // Rendered here rather than resolved later: the roster it would be
          // resolved against is exactly what just changed.
          onSubmit={() =>
            stashDraft(
              teamId,
              "order",
              draft.slots.map((entryId, index) => {
                const entry = entryId !== null ? byId.get(entryId) : undefined;
                return `${index + 1}. ${entry?.playerName ?? "—"}`;
              }),
            )
          }
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
          {/* The form's footer, not a chip — dnd-kit never touches this button,
              so the spinner inside it is clear of the drag tree the way
              AGENTS.md requires. `saveable` (draft vs. the stored chart) is
              still the resting reason to be disabled; pending adds its own. */}
          <SubmitButton disabled={!saveable} pendingLabel="Saving…">
            Save order
          </SubmitButton>
        </form>
      </div>
    </DndContext>
  );
}

function SlotItem({
  id,
  slotNumber,
  entry,
  declined,
}: {
  id: string;
  slotNumber: number;
  entry: ChartEditorEntry | undefined;
  declined: boolean;
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
        <PlayerLabel entry={entry} declined={declined} />
      ) : (
        <span className="text-sm text-muted-foreground">Empty slot</span>
      )}
    </li>
  );
}

function UnassignedPool({
  draft,
  byId,
  declined,
}: {
  draft: BattingDraft;
  byId: Map<string, ChartEditorEntry>;
  declined: ReadonlySet<string>;
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
              <PoolItem
                key={entryId}
                entry={entry}
                declined={declined.has(entryId)}
              />
            ) : null;
          })
        )}
      </div>
    </section>
  );
}

function PoolItem({
  entry,
  declined,
}: {
  entry: ChartEditorEntry;
  declined: boolean;
}) {
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
      <PlayerLabel entry={entry} declined={declined} />
    </div>
  );
}

function PlayerLabel({
  entry,
  declined,
}: {
  entry: ChartEditorEntry;
  declined: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
      <span className="truncate">
        {entry.playerName}
        {entry.jerseyNumber !== null ? (
          <span className="text-muted-foreground"> #{entry.jerseyNumber}</span>
        ) : null}
      </span>
      {/* The next game's decline, in the app's one RSVP vocabulary — a label
          and a colour, never colour alone (design-plan.md §10). The name keeps
          full strength: this player is still in the order, and fading them
          would read as "disabled" on a chip that is fully draggable.

          Static markup on a dnd-kit element, deliberately. No Motion, no
          animation class — dnd-kit owns `transform` here (AGENTS.md). */}
      {declined ? (
        <span
          className={`shrink-0 text-xs font-semibold ${RSVP_STYLE.declined.tagClassName}`}
        >
          {RSVP_STYLE.declined.label}
        </span>
      ) : null}
    </span>
  );
}
