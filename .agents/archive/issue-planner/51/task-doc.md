# Task Doc — Coach flow improvements: schedule entry, navigation labels, and form feedback (#51)

Four phases, one PR each, in dependency order: Phase 1 builds the shared feedback + icon
foundation the other three consume. Every phase ends green on `pnpm check`.

## Prerequisites

- [ ] None blocking. (Repeat-weekly event creation is explicitly deferred — file a
      follow-up issue when Phase 2 lands so the "discuss first" item isn't lost.)

## Phase 1: Foundation + form feedback (Block 3 — PR A)

**Shared components**
- [ ] Create `src/components/icons.tsx` — bespoke stroke SVG set (Pennant, Ticket,
      Diamond, Jersey, Megaphone, Scoreboard, Clipboard, Rolodex, Cap, Gear, Whistle,
      Check), all `aria-hidden="true" focusable="false"`, 24-unit viewBox; tests in
      `src/components/icons.test.tsx`
- [ ] Create `src/components/BaseballSpinner.tsx` (SVG ball + stitch arcs) and add
      `@utility animate-spin-ball` to `src/app/globals.css` with a
      `prefers-reduced-motion: reduce` gate, mirroring `animate-rise` (`globals.css:179-197`)
- [ ] Create `src/components/SubmitButton.tsx` — `"use client"`, `useFormStatus`,
      wraps `@/components/ui/button`; props `children` + `pendingLabel`; pending →
      `disabled`, spinner, label swap; tests in `SubmitButton.test.tsx` (mock
      `react-dom`'s `useFormStatus`)
- [ ] Create `src/components/StatusBanner.tsx` — success/alert banner, `animate-rise`,
      stroke-draw `CheckIcon` via new `@utility animate-tick`; tests in
      `StatusBanner.test.tsx`
- [ ] Update `docs/design/design-plan.md` §8 status note: save-success tick now built;
      name the two new utilities so `src/design-plan-drift.test.ts` §13 utility claims hold

**Pending states everywhere (mechanical sweep)**
- [ ] Replace the plain submit `<Button>` with `<SubmitButton>` in every mutating form:
      `src/app/invite/[token]/page.tsx:108`, `src/app/profile/page.tsx:83,144`,
      `src/app/signin/page.tsx:62`, `src/app/t/new/page.tsx:56`,
      `src/app/t/[teamId]/page.tsx:423,460`,
      `src/app/t/[teamId]/schedule/[eventId]/page.tsx:203,222,240,277,387`,
      `src/app/t/[teamId]/schedule/page.tsx:571`,
      `src/app/t/[teamId]/settings/page.tsx:70,150,161`,
      `src/app/t/[teamId]/roster/page.tsx:135`,
      `src/app/t/[teamId]/roster/returning/page.tsx:123`,
      `src/app/t/[teamId]/roster/[entryId]/page.tsx` (all six forms),
      `src/app/t/[teamId]/members/page.tsx:102,161`,
      `src/app/t/[teamId]/messages/new/page.tsx:120`,
      `src/app/t/[teamId]/roster/invite/page.tsx:177`
      (chart editors excluded — their `disabled` is dirty-state logic; give them
      pending via `useFormStatus` inside their existing footers without touching
      dnd-kit elements)

**Bulk invite (the flagship conversion)**
- [ ] Create `src/app/t/[teamId]/roster/invite/InviteForm.tsx` — `"use client"`,
      `useActionState`; rows with inline per-row errors (`aria-invalid`,
      `aria-describedby`, player name in the message); values preserved on every
      failure; pending copy "Sending N invitations — about ten seconds…"
- [ ] Rework `bulkInviteGuardiansAction` in
      `src/app/t/[teamId]/roster/invite/actions.ts` to the `useActionState`
      signature: per-row pre-flight validation returning `{rowErrors, values}` (no
      send until all rows valid); execution returns named outcome lists
      (sent/linked/failed with player name + reason) instead of the counter redirect
      at `actions.ts:198-202`; keep `MAX_ROWS`, `MIN_SEND_INTERVAL_MS`, `maxDuration`
      coupling intact; access failure still redirects `?error=access`
- [ ] Render named results via `StatusBanner` in `invite/page.tsx`; delete the
      conflated-counter copy at `page.tsx:74-87`
- [ ] Update `invite/actions.test.ts` + add `InviteForm.test.tsx`

**Echo-back for the other typing forms**
- [ ] Convert add player: extract the form at
      `src/app/t/[teamId]/roster/page.tsx:126-183` into `AddPlayerForm.tsx`
      (`useActionState`); rework `addPlayerAction` (`roster/actions.ts:106-146`) to
      return `{error, values}` on validation failure (redirects only for access);
      success keeps `redirect` and now appends `?added=1` so the existing banner at
      `roster/page.tsx:86-90` finally fires
- [ ] Convert invite member (`members/page.tsx:161-196`) and compose message
      (`messages/new/page.tsx:120` — fold `AudienceFields`'s `useState` into the new
      client form) the same way
- [ ] Length-limit messages state their numbers in every `messageTable` touched
      ("…keep it under 200 characters."); add missing `maxLength` to the three
      schedule text inputs (`schedule/page.tsx:544-569`) and any other limited input
      without one
- [ ] `aria-describedby` error wiring on the forms that lack it (roster add, members,
      messages, schedule, returning, bulk invite)

## Phase 2: Schedule entry (Block 1 — PR B)

- [ ] Create `src/app/t/[teamId]/schedule/AddEventForm.tsx` — `"use client"`,
      `useActionState`; props `initialValues` + `context: {view, month, past}`;
      sticky type/location/opponent after success (only `startsAt` and notes clear);
      hidden re-validated context fields; `id="add-event"` +
      `scroll-margin-top` anchor; `animate-rise` when prefilled
- [ ] Rework `createEventAction` (`schedule/actions.ts:160-181`): validation failure
      returns `{error, values}` (replacing the blanking redirect at `:165`); success
      `revalidatePath` + return `{ok, keep}`; access redirect at `:174` rebuilt with
      `URLSearchParams` carrying re-parsed `view`/`month`/`past` (via
      `parseViewParam`/`parseMonthParam` from `src/lib/calendar.ts`)
- [ ] `updateEventAction`/`deleteEventAction` redirects (`actions.ts:183-227`) carry
      the same re-parsed context so Back-to-schedule lands on the right view
- [ ] Schedule page (`schedule/page.tsx`): pass context + optional
      `?duplicate=<eventId>` prefill (team-scoped `getEvent`; date excluded) into
      `AddEventForm`; back-link and event links carry current view context
- [ ] Event page (`[eventId]/page.tsx`): "Duplicate event" `<Link>` with `TicketIcon`
      → `/t/${teamId}/schedule?duplicate=${event.id}#add-event`, inside the `canEdit`
      block next to the Edit card
- [ ] Update `schedule/actions.test.ts` (createEventAction block `:123-217`),
      `schedule/page.test.tsx`, `[eventId]/page.test.tsx`; add `AddEventForm.test.tsx`

## Phase 3: Navigation (Block 2 — PR C)

- [ ] `src/components/TeamNav.tsx`: relabel `/view` → "Game Day", `/chart` →
      "Edit Lineup"; add `icon` and `group: "team" | "coach"` to `TeamNavItem`; add
      owner-gated Members item (`base/members`, `CapIcon`); drop Settings'
      `alsoMatch` (`TeamNav.tsx:74-80`); seam divider + clay-tinted coach pills;
      `matchNavItem` untouched
- [ ] Update `TeamNav.test.tsx`: labels, Members gating, exactly-one-lit-tab on
      `/members`, keep `/chart/positions` → Edit Lineup section assertions
- [ ] Create `src/app/t/[teamId]/chart/EditorTabs.tsx` (server component, two
      segments: Batting Order | Positions); render atop both editors, replacing the
      small cross-links at `chart/page.tsx:104-106` and
      `chart/positions/page.tsx:102-104`; retitle "View chart" → "See Game Day view"
      (also the readiness page's links at `readiness/page.tsx:152,179,182,249,286,289`)
- [ ] Align `metadata.title` + visible headings with the new names
      (`view/page.tsx:29-31`, both editor pages, any tests pinning the strings)
- [ ] Update `chart/page.test.tsx`, `positions/page.test.tsx`, `view/page.test.tsx`,
      `readiness/page.test.tsx` for renamed links; add `EditorTabs.test.tsx`

## Phase 4: Roster & member admin polish (Block 4 — PR D)

- [ ] Returning picker: success redirect in `roster/returning/actions.ts:130` →
      `/t/${teamId}/roster/returning?added=${playerId}&q=${q}` (q from a hidden field,
      re-validated as plain text); `returning/page.tsx` renders the added candidate as
      a non-interactive "Added ✓" card (`animate-rise`, Field Green) in place, filter
      preserved; `email-failed` keeps the coach on the picker with the warning
- [ ] Duplicate-name warn: in `addPlayerAction`, case-insensitive trimmed exact match
      against team roster + returning candidates (new pure helper + query in
      `src/lib/roster.ts`); on match return `duplicate-name` state naming the match,
      with "Add anyway" (`force=1` hidden field) and a link to the returning picker
      when applicable; tests for case/trim variants and the force path
- [ ] Create `src/lib/roles.ts` with shared `ROLE_LABELS`; consume in
      `members/page.tsx` (select options `:112-116`, invited-as line `:145`),
      `directory/page.tsx:17-21` (delete local copy), team home's ad-hoc ternary
      (`page.tsx:540`)
- [ ] Members: `setMemberRoleAction` success redirect gains `?role-saved=1`
      (`members/actions.ts:123`) + `StatusBanner`; invitation rows render expiry via
      `src/lib/calendar.ts` helpers ("Expires Mar 4"); new `revokeInvitationAction`
      (`deleteMany({ id, teamId })`, OWNER) with `?revoked=1`; new
      `resendInvitationAction` reusing `createInvitation`'s delete-and-recreate with
      `?resent=1`; buttons on each pending row
- [ ] `src/components/TeamSwitcher.tsx:32-34`: option text becomes
      `{name} · {season}` when season is set (before the "(Archived)" suffix);
      test for both cases
- [ ] Chart draft stash: create `src/app/t/[teamId]/chart/DraftStash.tsx`
      (`"use client"`; sessionStorage key `chart-draft:<teamId>:<order|positions>`;
      read-only chalk-box "Your unsaved draft" panel listing the stashed board in
      human terms via `POSITION_LABELS`; Dismiss clears); both editors stash their
      serialized draft on submit and clear on `?saved=1`; panel rendered by both
      editor pages when `?error=chart-changed`; all storage access try/catch-wrapped;
      no element dnd-kit touches is involved
- [ ] Update `returning/actions.test.ts`, `returning/page.test.tsx`,
      `roster/actions.test.ts`, `members/actions.test.ts`, `members/page.test.tsx`,
      `directory/page.test.tsx`, `TeamSwitcher.test.tsx`; add `DraftStash.test.tsx`

## Pre-Commit Gate (every phase)

Per `AGENTS.md` ## Commands:

- [ ] `pnpm check` (lint → typecheck → test) ✅
- [ ] `pnpm exec next build` if build-affecting (CI's build half; never `pnpm build` off-Vercel) ✅

## Files Modified / Created (aggregate)

| File | Change |
|---|---|
| `src/components/icons.tsx` (+test) | NEW bespoke icon set |
| `src/components/BaseballSpinner.tsx` | NEW pending spinner |
| `src/components/SubmitButton.tsx` (+test) | NEW useFormStatus submit |
| `src/components/StatusBanner.tsx` (+test) | NEW animated status/alert banner |
| `src/components/TeamNav.tsx` (+test) | Renames, icons, groups, Members item |
| `src/components/TeamSwitcher.tsx` (+test) | Season suffix |
| `src/app/globals.css` | `animate-spin-ball`, `animate-tick` utilities |
| `docs/design/design-plan.md` | §8 status + utility claims (drift test) |
| `src/app/t/[teamId]/schedule/AddEventForm.tsx` (+test) | NEW client add-event form |
| `src/app/t/[teamId]/schedule/page.tsx` (+test) | Context + duplicate prefill |
| `src/app/t/[teamId]/schedule/actions.ts` (+test) | State-return + param preservation |
| `src/app/t/[teamId]/schedule/[eventId]/page.tsx` (+test) | Duplicate button |
| `src/app/t/[teamId]/roster/invite/InviteForm.tsx` (+test) | NEW client invite form |
| `src/app/t/[teamId]/roster/invite/actions.ts` (+test) | Per-row validation, named results |
| `src/app/t/[teamId]/roster/invite/page.tsx` | Renders new form + results |
| `src/app/t/[teamId]/roster/page.tsx` / `AddPlayerForm.tsx` (+tests) | Client form + dup warn |
| `src/app/t/[teamId]/roster/actions.ts` (+test) | Dup check, `?added=1` |
| `src/app/t/[teamId]/roster/returning/{page,actions}.tsx` (+tests) | Stay-on-picker flow |
| `src/app/t/[teamId]/roster/[entryId]/page.tsx` | SubmitButtons |
| `src/app/t/[teamId]/members/{page,actions}.tsx` (+tests) | Labels, feedback, expiry, revoke, resend |
| `src/lib/roles.ts` | NEW shared ROLE_LABELS |
| `src/app/t/[teamId]/directory/page.tsx` (+test) | Consume shared labels |
| `src/app/t/[teamId]/chart/EditorTabs.tsx` (+test) | NEW segmented control |
| `src/app/t/[teamId]/chart/DraftStash.tsx` (+test) | NEW draft-preservation panel |
| `src/app/t/[teamId]/chart/{page,BattingOrderEditor}.tsx` (+tests) | Tabs, stash, pending |
| `src/app/t/[teamId]/chart/positions/{page,PositionsEditor}.tsx` (+tests) | Tabs, stash, pending |
| `src/app/t/[teamId]/readiness/page.tsx` (+test) | Renamed cross-links |
| `src/app/t/[teamId]/view/page.tsx` (+test) | "Game Day" metadata title |
| `src/app/t/[teamId]/messages/new/…` (+tests) | Client compose form |
| `src/app/t/[teamId]/settings/page.tsx`, `t/new/page.tsx`, `profile/page.tsx`, `signin/page.tsx`, `invite/[token]/page.tsx`, `t/[teamId]/page.tsx` | SubmitButton sweep |
