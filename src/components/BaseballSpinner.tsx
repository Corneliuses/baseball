/// The pending indicator: a baseball, spinning.
///
/// Every mutating form in this app used to submit in complete silence — no
/// disabled state, no spinner, nothing between the tap and the next page. The
/// bulk invite paced ~9 seconds of sends behind that silence, which is how a
/// coach ends up sending the batch twice. `SubmitButton` fixes the silence;
/// this is what it shows.
///
/// Drawn rather than imported, like the rest of `icons.tsx`, and stroked in
/// `currentColor` so it reads on Field Green primary buttons and on card-stock
/// outline ones without knowing which it is on.
///
/// The rotation is `animate-spin-ball` (globals.css), which is gated on
/// `prefers-reduced-motion` like every other animation here. design-plan.md §8
/// forbids anything that loops forever; this loops only while a submission is
/// in flight, and the label beside it ("Sending…") carries the same news in
/// words — so a reader who gets no motion at all still learns the form is busy.
export function BaseballSpinner({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={`animate-spin-ball ${className}`}
    >
      <circle cx="12" cy="12" r="8.5" strokeWidth={1.75} />
      {/* The two seams, bowing away from each other the way they do on a ball. */}
      <path d="M6.2 6.2a9 9 0 013.1 11.6" strokeWidth={1.5} strokeDasharray="1.6 2" />
      <path d="M17.8 17.8a9 9 0 00-3.1-11.6" strokeWidth={1.5} strokeDasharray="1.6 2" />
    </svg>
  );
}
