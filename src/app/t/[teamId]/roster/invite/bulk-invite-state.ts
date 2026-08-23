/// The shape `bulkInviteGuardiansAction` hands back to `InviteForm`.
///
/// Separate from `actions.ts` because that file is `"use server"`, and a
/// `"use server"` module may only export async functions — every export becomes
/// a callable server endpoint. Types are erased before that rule applies, but
/// `BULK_INVITE_INITIAL_STATE` is a real runtime value and would break the
/// build if it lived there. It fails at `next build`, not at `pnpm check`,
/// which is exactly the kind of thing worth a file of its own to prevent.

/// What happened to one row, once the batch actually ran.
///
/// The old action reported three integers — sent, linked, failed — and the page
/// admitted in a comment that `failed` conflated three different states and that
/// only the roster could tell them apart. A coach reading "3 could not be
/// invited" had no way to learn *which three*, on a form where they had just
/// typed fifteen addresses. Naming the row is the whole fix.
export interface BulkInviteOutcome {
  entryId: string;
  /// Null only when the roster entry vanished between render and submit, which
  /// is also the one case where there is no player left to name.
  playerName: string | null;
  email: string;
  outcome: "sent" | "linked" | "failed";
  /// Why a `failed` row failed, in the coach's words. Absent otherwise.
  reason?: string;
}

export interface BulkInviteValues {
  /// entryId -> whatever was typed in that row, echoed back so a rejected
  /// batch never costs the coach fifteen addresses.
  emails: Record<string, string>;
  message: string;
}

export type BulkInviteState =
  | { status: "idle" }
  /// The batch was rejected before anything was sent. `message` is the
  /// batch-level problem (empty when the trouble is confined to rows);
  /// `rowErrors` is keyed by entryId, and the form — which already knows each
  /// row's player — renders the name beside the offending input.
  | {
      status: "invalid";
      message: string;
      rowErrors: Record<string, string>;
      values: BulkInviteValues;
    }
  | { status: "done"; outcomes: BulkInviteOutcome[] };

export const BULK_INVITE_INITIAL_STATE: BulkInviteState = { status: "idle" };
