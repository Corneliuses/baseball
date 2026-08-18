/// A jersey-style number chip: navy disc, cream numeral, tabular mono
/// (design-plan.md §5). Used for batting-order slot numbers and roster jersey
/// numbers so "a number on this team" always looks like the back of a shirt.
///
/// The number is content, not decoration — it stays real text.
export function JerseyDot({
  number,
  className = "",
}: {
  number: number | string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-sm font-bold text-background ${className}`}
    >
      {number}
    </span>
  );
}
