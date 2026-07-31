"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";

/// A subtle fade + rise on open — nothing more. `LazyMotion` already wraps the
/// whole app in src/app/layout.tsx, so this uses `m` only, never the top-level
/// `motion` import.
///
/// Deliberately no `layout` prop, here or on anything this wraps: #10 and #11
/// will make the lineup list and diamond markers draggable with `@dnd-kit`,
/// which positions a drag by writing `transform`. Motion's `layout` prop
/// animates `transform` too, and the two fighting over the same property is
/// what makes a dragged item lag or snap back (see AGENTS.md).
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </m.div>
  );
}
