/**
 * Hard ceiling on how many events one repeat-weekly submit may create (#70).
 *
 * 30 is the `MAX_ROWS` precedent from the bulk invite — a stated ceiling rather
 * than an implicit one — and it is well past a youth season, which is a dozen
 * games. The form caps at it, `weeklyOccurrences` throws past it, and
 * `parseRepeat` rejects past it, so a forged POST cannot turn one submit into
 * hundreds of rows.
 *
 * **Deliberately not coupled to the schedule page's `maxDuration`**, unlike
 * every other cap in this app (AGENTS.md's "cap × interval well under the
 * ceiling" rule). That rule governs loops that send *per row*; this one writes
 * per row and sends per *batch* — the parent announcement is one email per
 * guardian whether the coach created one event or thirty. So 30 rows in a
 * transaction sit next to an unchanged `MAX_RECIPIENTS` of 200 and 120s of send
 * pacing, and raising this number does not move that ceiling.
 *
 * ## Why this is its own module and must stay one
 *
 * It reads like it belongs in `calendar.ts` beside `weeklyOccurrences`, and it
 * cannot live there. Four things need it and two of them are client code —
 * `AddEventForm`'s `max` attribute and the message table it renders — while
 * `calendar.ts` reads `process.env.APP_TIMEZONE` at module scope and pulls in
 * date-fns, `@date-fns/tz` and its timezone data. Importing one number from
 * there would put all of that in the browser bundle for every coach opening the
 * schedule on a phone at a field, to render `max="30"`.
 *
 * Same reasoning as `event-form-state.ts` next door, which exists because a
 * constant could not live in a `"use server"` file: a value that has to cross a
 * boundary gets its own module rather than dragging its neighbours across.
 */
export const MAX_REPEAT_WEEKS = 30;
