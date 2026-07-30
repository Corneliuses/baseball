# Proposal — Phase 5: Returning-player picker and directory (#5)

## Executive Summary

Building next season's roster currently means retyping every kid and re-inviting every
parent, even though `Player`, `GuardianPlayer`, and `User` all survived the last season
untouched — that persistence is the entire point of Decision 15's identity model, and
nothing in the app spends it yet. This issue adds the owner-only picker that does:
choose a returning kid, give them a jersey number, and their linked guardians arrive on
the new team as parents in the same transaction. It also adds the directory — the one
screen where a parent at a field can find another parent's number.

The approach keeps the repo's existing split: the new-versus-existing membership decision
lives in a pure, exhaustively tested `src/lib/returning-players.ts`, and the transaction is
a thin wrapper around it in `roster.ts`. The rule that matters — **an existing `Membership`
is never modified, so roles never inherit across seasons** — is enforced structurally rather
than by discipline: the write is a `createMany({ skipDuplicates: true })` over the computed
new-members set, a statement with no update branch for a future edit to fill in. The
"you've been added" email keys off that same set, which is what keeps it quiet when a coach
adds two siblings in one sitting. No schema change, no migration, no new dependencies.

## Scope

### In Scope

- Owner-only `/t/[teamId]/roster/returning` picker listing players from any other team,
  active or archived, excluding those already rostered here, with a name filter.
- The Decision 15 cascade in one transaction: `RosterEntry` insert with an optional jersey
  number, then `Membership(guardian, team, PARENT)` for each linked guardian.
- Pure `src/lib/returning-players.ts` computing newly-created versus already-present
  guardian memberships, with co-located tests.
- A tokenless "you've been added to *team*" email to only the newly-added guardians.
- `/t/[teamId]/directory` — name, phone, email, and the kids each member guards **on this
  team** — visible to every signed-in member.
- An owner/coach-editable phone field on the guardian rows of the player detail page, so
  the directory has phone numbers to show on day one.
- Navigation links from the team home and roster pages.

### Out of Scope

- **Bulk "copy last season's roster."** Explicitly rejected by the brief — the pick is
  deliberate because rosters genuinely change between seasons.
- **A self-serve profile page** where a parent edits their own name and phone. It is a new
  unscoped route with its own auth surface; the owner-entered field covers the directory's
  need now. Worth a follow-up issue.
- **Cross-team views of any other kind** — no player history page, no season-over-season
  reporting. This picker is the one deliberate seam between teams.
- **Verifying the `P2002` `meta.target` shape against live Postgres.** A pre-existing
  caveat in `AGENTS.md`; this issue reuses the existing mapping rather than adding a second
  one, so the eventual verification fixes both paths at once.
- **Removing a returning player's guardians when the roster spot is removed.** Unchanged
  from #4: removal deletes the roster spot only.

## Acceptance Criteria

1. `/t/[teamId]/roster/returning` lists every `Player` with a `RosterEntry` on some other
   team and none on this team, showing name, teams/seasons played on, and guardian count.
2. The picker is OWNER-only to view and to write; COACH and PARENT get `notFound()`. This is
   the only global `Player` read in the app.
3. Picking a player inserts `RosterEntry(player, team)` with an optional jersey number and
   creates `Membership(guardian, team, PARENT)` for every `GuardianPlayer` of that player,
   in one transaction.
4. An existing `Membership` is never modified — a guardian who is already COACH or OWNER
   here keeps that role. No code path in this issue issues a `membership.update`.
5. `src/lib/returning-players.ts` is pure and DB-free, computes newly-created versus
   already-present memberships, and is tested for none/all/mixed/duplicate/empty inputs.
6. The "you've been added" email goes only to guardians whose membership this call created,
   carries no magic-link token, and links to the team page. Adding a second sibling
   re-notifies nobody.
7. A duplicate jersey number, or a player rostered between render and submit, produces a
   friendly field error via the existing `rosterWriteFailure` mapping.
8. `/t/[teamId]/directory` lists every member with name, phone, email, and the kids they
   guard **on this team**, visible to any signed-in member.
9. An owner or coach can set and clear a guardian's phone from the player detail page, and
   it appears in the directory.
10. Every write calls `requireTeamAccess` with `intent: "write"` first — `minRole: "OWNER"`
    for the pick, `"COACH"` for the phone edit. Archived teams reject both.
11. No Prisma call from a component; all queries live in `src/lib/`.
12. `pnpm check` and `pnpm build` are green.

## Implementation Phases

| Phase | Description | Areas affected |
|---|---|---|
| 1 | Pure core and the notice email — `returning-players.ts`, `phone.ts`, `directory-rules.ts`, `AddedToTeamEmail` and its builder, all with tests | `src/lib/`, `src/emails/` |
| 2 | The picker — candidate query, transactional cascade, route and action | `src/lib/roster.ts`, `src/app/t/[teamId]/roster/returning/` |
| 3 | Directory and guardian phone, navigation links, docs refresh | `src/lib/memberships.ts`, `src/lib/invitations.ts`, `src/app/t/[teamId]/directory/`, `src/app/t/[teamId]/roster/`, `README.md`, `AGENTS.md` |

Phase 1 is separated because the cascade's correctness lives there and is fully testable
before any route exists — the AC4 rule is proven in unit tests, not discovered in the UI.
Phases 2 and 3 are independent of each other beyond Phase 1 and could be reviewed as
separate PRs.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A guardian who coached last season is silently elevated (or demoted) on the new team | **High** — the rule the issue exists to protect | `createMany({ skipDuplicates: true })` over a computed set: no update branch exists to get wrong. Excluded guardians are also excluded from the email. Directly unit-tested. |
| Adding two siblings re-notifies the household | Med | The email keys off newly-created memberships, not the guardian list. Directly unit-tested. |
| A never-signed-in guardian gets a notice with no way in | Med | The cascade creates a `Membership`, and `decideSignIn` already admits any address holding one. The link bounces through `/signin?callbackUrl=/t/<id>` and works for both populations without a second grant path. |
| Notice email fails after the roster write commits | Low | The write stands and the guardian has access regardless; a banner reports the failure. Rolling back correct database state over a bounced courtesy email would surprise the coach more. |
| Directory leaks a child's participation on an unrelated team | Med | The guarded-player read is scoped by `teamId` in the query itself, not post-filtered. |
| `rosterWriteFailure`'s `P2002` shape is unverified against live Postgres | Med | Pre-existing and documented; reused rather than duplicated. Not resolved here. |
| Candidate list grows across many seasons | Low | Name filter; one query, no N+1. Realistically 25–75 rows. |

## Effort Estimate

**Overall:** Medium (3–5 days), including tests, docs, and review cycles.

| Phase | Estimate |
|---|---|
| Phase 1 — pure core and email | ~1 day |
| Phase 2 — picker, cascade, action | ~1.5–2 days |
| Phase 3 — directory, phone, nav, docs | ~1–1.5 days |

No migration, no new dependencies, and no new environment variables, which is what keeps
this at Medium rather than Large despite touching seven existing files.

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` phase by phase on `claude/issue-planner-a9atz6`.
3. After implementation, finalize with the `finalize-issue` skill — verify each AC against
   the PR, archive `.agents/issue-planner/5/`, merge, and close the issue.
