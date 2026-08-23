import {
  monthParam,
  parseMonthParam,
  parseViewParam,
} from "@/lib/calendar";

/**
 * Which schedule the coach is looking at, carried across a submit.
 *
 * Every event mutation used to redirect to a bare `/t/<id>/schedule`, which
 * dropped `view`, `month` and `past` on the floor. That is worse than it
 * sounds: `parseViewParam` treats anything that is not exactly `"list"` as
 * month, so a coach working down a list was silently thrown back to the grid —
 * and a coach adding games to next April landed in this month, every time
 * (Dugout Report C1).
 *
 * Carried as **three validated fields, never a return URL.** `rsvpAction`'s
 * docstring makes the argument and it applies unchanged here: a `returnTo` URL
 * field would say the same thing while handing anyone who can craft a form an
 * open redirect out of a signed-in POST. These three can only ever express a
 * destination this file already writes down — `view` is one of two words,
 * `month` is re-parsed by `parseMonthParam` (which never throws and falls back
 * to the current month), and `past` is a boolean.
 */
export interface ScheduleContext {
  view: "month" | "list";
  /// `YYYY-MM`, already normalised through `parseMonthParam`.
  month: string;
  /// The list view's past/upcoming toggle. Meaningless in month view, and
  /// harmless there.
  past: boolean;
}

/// Read the context out of raw search params, normalising as the page does.
export function scheduleContextFrom(
  params: { view?: string; month?: string; past?: string },
  now: Date,
): ScheduleContext {
  return {
    view: parseViewParam(params.view),
    month: monthParam(parseMonthParam(params.month, now)),
    past: params.past === "1",
  };
}

/**
 * Re-derive the context from a submitted form.
 *
 * The values arrive from hidden inputs, which means they arrive from whatever
 * the POST carried — so every one is put back through the same parser the page
 * uses rather than trusted. A forged `month=<script>` becomes the current
 * month; a forged `view=anything` becomes `"month"`. Neither can steer a
 * redirect anywhere this module would not otherwise send it.
 */
export function scheduleContextFromForm(
  formData: FormData,
  now: Date,
): ScheduleContext {
  return scheduleContextFrom(
    {
      view: stringOrUndefined(formData.get("view")),
      month: stringOrUndefined(formData.get("month")),
      past: stringOrUndefined(formData.get("past")),
    },
    now,
  );
}

function stringOrUndefined(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/// The query string for a context, omitting what the page would default to
/// anyway so the common URL stays short and shareable.
export function scheduleQuery(
  context: ScheduleContext,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();
  if (context.view === "list") {
    params.set("view", "list");
    // `past` only means anything in the list view, and the Month/List toggle
    // deliberately drops it when switching. Carrying it into a month URL would
    // resurrect a toggle the coach cannot see.
    if (context.past) {
      params.set("past", "1");
    }
  } else {
    params.set("view", "month");
    params.set("month", context.month);
  }
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }
  return params.toString();
}

/// A schedule URL that lands on the view the coach was already looking at.
export function scheduleUrl(
  teamId: string,
  context: ScheduleContext,
  extra: Record<string, string> = {},
): string {
  return `/t/${teamId}/schedule?${scheduleQuery(context, extra)}`;
}

/// An event URL that remembers the schedule it was opened from, so the detail
/// page's back link and its save/delete redirects can return there.
export function eventUrl(
  teamId: string,
  eventId: string,
  context: ScheduleContext,
  extra: Record<string, string> = {},
): string {
  return `/t/${teamId}/schedule/${eventId}?${scheduleQuery(context, extra)}`;
}
