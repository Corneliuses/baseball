# Proposal — Phase 13: Email messaging (#13)

## Executive Summary

This phase gives the coach one-click email broadcasts to all parents and targeted emails
to individual parents, and gives parents a way to email the whole coaching staff at once —
replacing the group text with the app's channel of record. Recipient resolution lives in a
pure, exhaustively tested function in `src/lib/messages.ts` that structurally forbids any
parent-to-parent path; sends reuse the existing Resend + React Email plumbing from #4 and
the paced fan-out pattern proven in the bulk invite action.

Three product decisions were confirmed with the owner before planning: the message list
view is **coach-and-above only** (like the directory), **only broadcasts persist** as
`Message` rows (individual and parent→coach sends are email-only, so no schema change is
needed), and every outbound email sets **Reply-To to the sender's own address** so
replies continue as ordinary email.

## Scope

### In Scope
- `Message` row creation for coach → all-parents broadcasts (senderId, subject, body)
- Coach → all parents broadcast; coach → individual parent; parent → all coaches
- Pure recipient-resolution function with the no-parent-to-parent invariant tested
- `TeamMessageEmail` React Email template + pure props builder, sent via Resend
- Coach-only broadcast history at `/t/[teamId]/messages`; compose at `/t/[teamId]/messages/new`
- `Reply-To` support in the shared `sendEmail` wrapper
- Messages tab in `TeamNav` for all roles

### Out of Scope
- Push notifications (Decision 8 — deferred past MVP; email is the channel of record)
- Parent-to-parent messaging (explicitly excluded by the brief)
- Coach → coaching-staff messages, message threading/replies in-app, read receipts
- Schema changes (no audience column; the owner chose broadcasts-only persistence)
- Queues/workers — fan-out is ~25 recipients, sent inline from the server action

## Acceptance Criteria

1. `Message` creation is team-scoped, recording `senderId`, `subject`, `body`
2. Coach → all parents broadcast resolves recipients from `Membership(role: PARENT)` on that team
3. Coach → individual parent works (target validated as a PARENT member of that team)
4. Parent → all coaches (OWNER + COACH memberships on that team) works
5. No parent-to-parent path exists anywhere — enforced in the pure resolver, with a test
6. Emails are React Email templates sent via Resend, reusing the #4 setup, with Reply-To = sender
7. Broadcast history renders at `/t/[teamId]/messages`, COACH+ only
8. Recipient resolution is a pure, tested function in `src/lib/messages.ts`
9. Archived teams reject every send (`requireTeamAccess` with `intent: "write"`)
10. `pnpm check` and the build pass

## Implementation Phases

| Phase | Description | Areas Affected |
|---|---|---|
| 1 | Domain & email plumbing: `replyTo` in the wrapper, pure resolver + schemas + DB wrappers, template + builder, all unit tests | `src/lib/`, `src/emails/` |
| 2 | Server action, list + compose pages, nav tab, page/action tests | `src/app/t/[teamId]/messages/`, `src/components/` |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Unverified domain lands broadcasts in spam | High | Operational: `EMAIL_FROM` warning in `.env.example`; #9's real-weekend validation already exercised delivery |
| Resend rate limit (2 req/s) clips a broadcast's tail | Med | 600ms pacing per send (bulk-invite pattern); failures counted and surfaced, never aborting the loop |
| Action timeout mid-broadcast | Med | `maxDuration = 60` on the compose page + `MAX_RECIPIENTS = 50` cap keeps worst-case pacing at 30s |
| Forged POST addressing a non-member or coach as the "individual parent" | High | Resolver only accepts a PARENT membership on the URL's teamId; tested |
| Parent email addresses leaking to other parents | High | One email per recipient (no shared To/BCC); Reply-To exposes only the sender's own address |

## Effort Estimate

**Overall:** Medium (2–3 days)

| Phase | Estimate |
|---|---|
| Phase 1 | ~1 day |
| Phase 2 | 1–1.5 days |

## Next Steps

1. Review and approve this proposal.
2. Follow `task-doc.md` to implement phase by phase.
3. After implementation, finalize with the `finalize-issue` skill (verify AC against the
   PR, archive `.agents/issue-planner/13/`, merge, and close the issue).
