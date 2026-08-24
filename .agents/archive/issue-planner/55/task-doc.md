# Task Doc — Readiness: show the effective batting order and decline badges in the chart editors (#55)

## Prerequisites

- [ ] None. #54 (coach-recorded absences) is already merged — this issue's "pairs well
      with" partner — and readiness is deliberately provenance-blind, so nothing here
      cares who recorded an RSVP.

## Phase 1: Readiness — render the effective order

- [ ] In `src/app/t/[teamId]/readiness/page.tsx`, add a local `EffectiveOrderList`
      component: an `<ol>` of dugout rows — `JerseyDot` (`@/components/JerseyDot`)
      showing `index + 1` (ranks closed up, never `entry.battingOrder`), player name,
      mono `#jersey` when present. No RSVP tags: declined players are removed and the
      awaiting card already accounts for silence.
- [ ] Render it in a new Card between "Positions uncovered" and the awaiting card, gated
      on `readiness.declined.some((entry) => entry.battingOrder !== null)`. Copy in the
      app's warm voice, present-tense and explicit that nothing is stored — e.g. title
      "The order as it stands", description "With the players above out, this is
      Saturday's batting order if the chart stays as-is. Nothing is saved here — edit the
      chart to change it."
- [ ] Handle the all-batters-declined edge inside the card: when
      `readiness.effectiveOrder.length === 0`, a one-line message instead of the `<ol>`.
- [ ] Extend `src/app/t/[teamId]/readiness/page.test.tsx` (existing mock-and-
      `renderToStaticMarkup` pattern): card present when an order-holding player
      declined; slot numbers renumber (batter 1 and 3 remain → rendered 1 and 2); card
      absent when ready; card absent when only a position-only player declined; empty
      state when every batter declined.

## Phase 2: Editors — declined badges

- [ ] `src/app/t/[teamId]/chart/page.tsx`: fetch `nextGame(teamId)` alongside
      `getChart` (`Promise.all`); when a game exists, `listEventRsvps(teamId, game.id)`
      → `buildRsvpStateMap` over the chart's `playerId`s → derive
      `declinedEntryIds: string[]` (entries whose state is `"declined"`, mapped to
      `entryId`). Pass to `BattingOrderEditor`. No game → `[]`.
- [ ] `src/app/t/[teamId]/chart/BattingOrderEditor.tsx`: add prop
      `declinedEntryIds?: readonly string[]` (default `[]`), build a `Set` once.
      `PlayerLabel` gains optional `declined` boolean; when set, append a static
      `<span className={\`text-xs ${RSVP_STYLE.declined.tagClassName}\`}>` with
      `RSVP_STYLE.declined.label`. `SlotItem` and `PoolItem` pass the flag. Update the
      `ChartEditorEntry` doc comment: entry rows still carry no RSVP state — decoration
      arrives on a side channel the draft logic (`src/lib/chart.ts`) never sees.
- [ ] `src/app/t/[teamId]/chart/positions/page.tsx`: same loader change, passing
      `declinedEntryIds` to `PositionsEditor`.
- [ ] `src/app/t/[teamId]/chart/positions/PositionsEditor.tsx`: same prop; `Chip` gains
      the `declined` flag and the identical static tag (both seated chips and zone
      chips). Same comment update on `PositionsEditorEntry`.
- [ ] Extend `src/app/t/[teamId]/chart/page.test.tsx` and
      `src/app/t/[teamId]/chart/positions/page.test.tsx` (editor is mocked; assert
      props): `declinedEntryIds` derived from the next game's RSVPs; `[]` when
      `nextGame` resolves null (AC4). Add `nextGame` / `listEventRsvps` to the mock
      blocks.
- [ ] Extend `src/app/t/[teamId]/chart/BattingOrderEditor.test.tsx` and
      `src/app/t/[teamId]/chart/positions/PositionsEditor.test.tsx`: "Not going" tag on
      a declined player's chip in a slot and in the pool/zone; absent for others; absent
      when the prop is omitted (renders exactly as today); the save form's hidden
      `order`/`positions` and `baseline` inputs are unchanged by the prop.

## Pre-Commit Gate

Per AGENTS.md `## Commands`:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` if a full build check is wanted (never `pnpm build` in CI —
      it runs `prisma migrate deploy`)

## Files Modified / Created

| File | Change |
|---|---|
| `src/app/t/[teamId]/readiness/page.tsx` | Effective-order card + `EffectiveOrderList`, gated on an order-affecting decline |
| `src/app/t/[teamId]/readiness/page.test.tsx` | Gate, renumbering, position-only-decliner and empty-order cases |
| `src/app/t/[teamId]/chart/page.tsx` | Fetch next game + RSVPs; derive and pass `declinedEntryIds` |
| `src/app/t/[teamId]/chart/BattingOrderEditor.tsx` | `declinedEntryIds` prop; static declined tag in `PlayerLabel` |
| `src/app/t/[teamId]/chart/page.test.tsx` | Prop derivation tests; new mocks |
| `src/app/t/[teamId]/chart/BattingOrderEditor.test.tsx` | Badge rendering + unchanged-save tests |
| `src/app/t/[teamId]/chart/positions/page.tsx` | Same loader change |
| `src/app/t/[teamId]/chart/positions/PositionsEditor.tsx` | Same prop; tag in `Chip` |
| `src/app/t/[teamId]/chart/positions/page.test.tsx` | Prop derivation tests; new mocks |
| `src/app/t/[teamId]/chart/positions/PositionsEditor.test.tsx` | Badge rendering + unchanged-save tests |
