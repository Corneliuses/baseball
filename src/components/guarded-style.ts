/// The one visual vocabulary for "this is your kid", shared by the view page's
/// diamond, its batting order and its bench list (#49).
///
/// In one module for the same reason `rsvp-style.ts` is: the emphasis appears
/// in three places on one screen, and this repo has already had two pages drift
/// into different dialects of the same idea once.
///
/// **Colour is never the only carrier.** design-plan.md §10 is explicit that
/// state means colour *plus* a label, and this page is read outdoors by
/// colour-blind parents like everyone else. The halo has `YOUR_PLAYER_TEXT`
/// beside it in every list, and the diamond's `sr-only` mirror says it in
/// words — the ring is the fast path, not the only path.
///
/// **This is `/view`'s one banana** (design-plan.md §2). The page used to spend
/// it on `FieldArt`'s outfield fence; the fence now draws in chalk there and the
/// yellow belongs to the reader's own child, which is the loudest thing that
/// page has to say. `FieldArt`'s `fence` prop is where that trade is made, and
/// the positions editor still spends its own banana on the fence.

export const YOUR_PLAYER_TEXT = "Your player";

/// The `sr-only` diamond mirror's suffix. Lower case and parenthesised because
/// it is appended to a sentence a screen reader is already reading out
/// ("Shortstop: Ava Castellanos, Going (your player)"), not used as a heading.
export const YOUR_PLAYER_SR_SUFFIX = "(your player)";

export const GUARDED_STYLE = {
  /// The ring drawn *behind* a guarded player's marker on the diamond, at
  /// `DIAMOND_GEOMETRY.haloRadius`. Unfilled: the marker's own opaque fill sits
  /// on top of it, and a filled halo would read as a second, larger circle.
  haloClassName: "fill-none stroke-banana",
  haloStrokeWidth: 3,
  /// The guarded player's name on the field. Bold rather than recoloured —
  /// `RSVP_STYLE.markerNameClassName` already owns this text's colour, and
  /// overriding it would erase the declined/going distinction for exactly the
  /// one family that most needs to see it.
  markerNameClassName: "font-bold",
  /// A guarded batting-order or bench row. Replaces the row's default border
  /// rather than layering on it, so the two never render a double ring.
  rowClassName: "border-banana bg-banana/10",
  /// The `Your player` chip on that row. Navy on banana, the pairing
  /// design-plan.md §4 measures at 7.5:1.
  badgeClassName:
    "shrink-0 rounded-full bg-banana px-2 py-0.5 text-[10px] font-semibold text-banana-foreground",
} as const;
