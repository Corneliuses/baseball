# Proposal — Coach flow improvements: schedule entry, navigation labels, and form feedback (#51)

## Executive Summary

This plan fixes all four friction blocks from the Aug 2026 Dugout Report — schedule entry
that costs ~60 interactions a season, nav labels that invert meaning, forms that give no
feedback and punish mistakes, and unpolished roster/member admin — and does it as a
deliberate UX-design pass rather than a set of patches. The app gets its first real
interaction-feedback layer: a bespoke hand-drawn "dugout" icon set (pennant, ticket,
diamond, clipboard, whistle — no icon library added), a spinning-baseball pending state on
every mutating form, an animated stroke-draw ✓ on success banners (finally shipping the
design plan's unbuilt §8 "save-success tick"), and micro-motion on nav and prefilled
forms — all inside the Pastoral Banana Ball rules: one banana per screen, calm admin
surfaces, reduced-motion respected, and nothing animated that dnd-kit drags.

Technically, the plan introduces React 19's `useActionState` for the five forms where
people actually type (add event, bulk invite, add player, invite member, compose
message), so validation errors return typed state with values intact instead of a
blanking redirect — which also eliminates the full reload, the scroll-to-top, and the
lost `view=`/`month=` params in one move. Everything else keeps the repo's established
redirect-`?error=` pattern and gains pending states via one shared `useFormStatus`
submit button. No schema changes, no new dependencies.

## Scope

### In Scope
- **Block 1** — schedule context preserved across submits; sticky type/location/opponent
  after "Add"; "Duplicate event" prefill button on the event page; no more blank-on-error
- **Block 2** — nav renames (`/view` → **Game Day**, `/chart` → **Edit Lineup**), icons
  on all pills, coach tools visually grouped behind a stitch-seam divider on clay-tinted
  stock, Members gets its own owner-gated tab, Batting Order | Positions become a
  segmented control atop both editors
- **Block 3** — pending/disabled submit states on every mutating form (bulk invite
  first); value echo-back on the five typing forms; per-row bulk-invite validation that
  names the offending row and named (not counted) results; length-limit errors state
  their limits with matching `maxLength` attributes
- **Block 4** — returning-player picker keeps the coach on the picker with an "Added ✓"
  row and preserved filter; exact-name duplicate warning ("same kid?") with an explicit
  "Add anyway" step; members page gets human role labels, role-change success feedback,
  invitation expiry, revoke and resend; team switcher shows the season; chart-conflict
  rejections preserve the coach's losing draft on screen (sessionStorage-backed
  read-only panel) for manual re-application

### Out of Scope
- Repeat-weekly event creation (the issue's "discuss first" item — deferred to a
  follow-up issue, filed when Phase 2 lands)
- Confetti on chart save (design plan §8 defers it pending a dependency; noted as the
  natural follow-up flourish)
- Coach-recorded absences, readiness effective-order display, chart undo (excluded by
  the issue itself)

## Acceptance Criteria

1. Create-event redirects preserve the current `view=`/`month=`/`past=` params
2. After "Add", type/location/opponent stay prefilled; only date and notes clear
3. "Duplicate event" on the event detail page prefills the add form (all but the date)
4. Add-event validation errors echo submitted values back — no blanking, no scroll-jump
5. `/view` and `/chart` tabs renamed so viewer and editor cannot be confused;
   `matchNavItem` section highlighting stays correct (tests updated and passing)
6. Batting order and Positions are peer segments within the editor section
7. Coach-only nav destinations are visually separated from parent-visible ones
8. Members is reachable from the nav without knowing it lives under Settings
9. All mutating forms show a `useFormStatus`-based pending/disabled state with the
   animated spinner (bulk invite first — closing its ~9s double-submit hole)
10. The five typing forms echo values back on validation failure
11. Bulk invite validates per-row, names offending rows inline, and reports results as
    named lists (sent/linked/failed with reasons), not counts
12. Length-limit errors state the limit; limited inputs carry matching `maxLength`
13. Returning-player picker stays on the picker after each add with an "Added ✓" row,
    filter preserved
14. Manual player add warns on an exact name match before creating a duplicate `Player`;
    "Add anyway" proceeds
15. Members page shows Parent/Coach/Owner labels, confirms role changes, shows
    invitation expiry, and offers revoke + resend
16. Team switcher appends the season label
17. A `chart-changed` rejection keeps the coach's losing draft visible in a read-only
    panel until saved over or dismissed
18. `pnpm check` green on every phase; no schema changes; no new dependencies

## Implementation Phases

| Phase | PR | Description | Areas Affected |
|---|---|---|---|
| 1 | A | Foundation + form feedback (Block 3): icons, spinner, SubmitButton, StatusBanner, pending sweep, bulk-invite + typing-form conversions, length-limit copy | `src/components/`, `globals.css`, `roster/invite/`, `roster/`, `members/`, `messages/new/`, design-plan §8 note |
| 2 | B | Schedule entry (Block 1): context preservation, sticky client form, duplicate-event prefill | `schedule/` |
| 3 | C | Navigation (Block 2): renames, icons, grouping, Members tab, EditorTabs | `TeamNav.tsx`, `chart/`, `view/`, `readiness/` |
| 4 | D | Roster & member polish (Block 4): picker flow, dup warning, members polish, switcher season, chart draft stash | `roster/returning/`, `roster/`, `members/`, `directory/`, `TeamSwitcher.tsx`, `chart/`, `src/lib/roles.ts` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| First `useActionState` in the repo — pattern risk across 5 forms | Med | Phase 1 establishes it on bulk invite with full tests; later forms copy a proven shape. No-JS fallback remains today's full-POST behavior |
| Hidden context fields (`view`/`month`) forwarded into redirects | Low | Re-validated via `parseViewParam`/`parseMonthParam` before emission; enum/format only, never a `returnTo` URL (open-redirect doctrine at `schedule/actions.ts:236-247`) |
| Nav renames break tests/muscle memory | Low | URLs unchanged; `TeamNav.test.tsx` + page-title assertions updated in the same PR |
| Draft-stash storage unavailable (private mode) | Low | try/catch; degrades to current behavior |
| Animation collides with dnd-kit or SSR rules | Low | All new motion is CSS with reduced-motion gates, outside the drag tree; no opacity in any SSR-rendered initial state (the `Reveal` rule) |
| Design-plan drift test fires on new utilities | Low | design-plan.md §8 updated in Phase 1 alongside `globals.css` |

## Effort Estimate

**Overall:** Large (~6 working days across 4 PRs)

| Phase | Estimate |
|---|---|
| 1 (foundation + forms) | 2 days |
| 2 (schedule) | 1–1.5 days |
| 3 (navigation) | 1 day |
| 4 (roster/members polish) | 1.5–2 days |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase — each phase is one PR, gated on `pnpm check`.
3. When Phase 2 lands, file the deferred repeat-weekly follow-up issue.
4. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PRs, archive `.agents/issue-planner/51/`, merge, and close the issue).
