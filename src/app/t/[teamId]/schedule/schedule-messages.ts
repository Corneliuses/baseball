import { messageTable } from "@/lib/error-messages";
/// From `repeat-weekly.ts`, not `calendar.ts` — this table is rendered by a
/// client component, and that module explains why one number must not drag
/// date-fns and the timezone database into the browser bundle.
import { MAX_REPEAT_WEEKS } from "@/lib/repeat-weekly";

/// The schedule's failure vocabulary, in one place because three surfaces read
/// it: the schedule page and the event page for the codes that still arrive as
/// `?error=`, and `AddEventForm` for the ones `createEventAction` now returns
/// as state.
///
/// The limits are named rather than implied. Location, opponent and notes were
/// reachable purely by typing — the inputs carried no `maxLength` — so a coach
/// could be told "too long" with no idea by how much (#51). Both halves are
/// fixed: the fields now stop where the action does, and the sentence says
/// where that is for anything that still gets through (a paste, a forged POST).
///
/// `messageTable`, never a bare object literal — see src/lib/error-messages.ts.
export const SCHEDULE_ERROR_MESSAGES = messageTable({
  "invalid-type": "Choose either a game or a practice.",
  "invalid-datetime": "Enter a valid date and time.",
  "invalid-location": "Location is too long — keep it under 200 characters.",
  "invalid-opponent": "Opponent is too long — keep it under 200 characters.",
  "invalid-notes": "Notes are too long — keep them under 2,000 characters.",
  // Names the limit, like the three above it. Reachable by typing (the input
  // caps at 30 but a paste or a stepper can exceed it) and by a forged post.
  "invalid-repeat": `Repeat must be a whole number of weeks between 1 and ${MAX_REPEAT_WEEKS}.`,
  // Only the event page can produce these — RSVPs are answered there — but
  // `rsvpAction` lives in the same actions module as the event mutations, so
  // its vocabulary belongs in the same table rather than in a second one that
  // has to be kept in step by hand.
  "invalid-rsvp": "Choose a valid response.",
  "not-your-player": "You can only RSVP for your own kids.",
  "not-on-team": "That player is not on this team's roster.",
  access: "You no longer have access to make this change.",
});
