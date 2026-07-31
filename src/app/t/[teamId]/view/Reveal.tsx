"use client";

import type { ReactNode } from "react";
import { m } from "motion/react";

/// A subtle rise on open — nothing more. `LazyMotion` already wraps the whole
/// app in src/app/layout.tsx, so this uses `m` only, never the top-level
/// `motion` import.
///
/// **No opacity in `initial`, deliberately.** Motion serializes `initial` into
/// the server-rendered markup, so `initial={{ opacity: 0 }}` ships
/// `style="opacity:0"` in the HTML and the chart stays invisible until the JS
/// bundle loads and hydrates. This page is read at a field on one bar of
/// signal — the content has to be legible from the raw HTML, with the
/// animation as polish on top. A translate-only reveal degrades to "content
/// sits 8px lower", not "blank page". Covered by Reveal.test.tsx; don't add
/// the fade back.
///
/// Also no `layout` prop, here or on anything this wraps: #10 and #11 will
/// make the lineup list and diamond markers draggable with `@dnd-kit`, which
/// positions a drag by writing `transform`. Motion's `layout` prop animates
/// `transform` too, and the two fighting over the same property is what makes
/// a dragged item lag or snap back (see AGENTS.md).
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </m.div>
  );
}
