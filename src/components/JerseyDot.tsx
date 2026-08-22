/// A jersey-style number chip: navy disc, cream numeral, tabular mono
/// (design-plan.md §5). Used for batting-order slot numbers and roster jersey
/// numbers so "a number on this team" always looks like the back of a shirt.
///
/// The number is content, not decoration — it stays real text.
export function JerseyDot({
  number,
  className = "",
  size = "sm",
}: {
  number: number | string;
  className?: string;
  /// "lg" is the hero cut for team home's player card, where the number itself
  /// is the celebration. A variant rather than caller-supplied `h-*`/`w-*`
  /// classes because two conflicting Tailwind size utilities resolve by
  /// stylesheet order, not by which one the caller appended last.
  size?: "sm" | "lg";
}) {
  const sizeClassName = size === "lg" ? "h-12 w-12 text-xl" : "h-7 w-7 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-mono font-bold text-background ${sizeClassName} ${className}`}
    >
      {number}
    </span>
  );
}
