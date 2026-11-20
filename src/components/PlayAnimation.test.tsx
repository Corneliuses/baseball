import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlayAnimation } from "./PlayAnimation";
import { getPlay } from "@/lib/plays";

const play = getPlay("give-and-go")!;

describe("PlayAnimation", () => {
  it("renders the set from the server, before any clock runs", () => {
    const html = renderToStaticMarkup(<PlayAnimation play={play} />);

    expect(html).toContain(`Step 1 of ${play.frames.length}`);
    expect(html).toContain(play.frames[0].caption);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(html).toContain(`data-player="${n}"`);
    }
    expect(html).toContain("data-ball");
  });

  it("lists every step for a screen reader and hides the drawing", () => {
    const html = renderToStaticMarkup(<PlayAnimation play={play} />);

    for (const frame of play.frames) {
      expect(html).toContain(frame.caption.replace(/'/g, "&#x27;"));
    }
    expect(html).toMatch(/<div[^>]*aria-hidden="true"[^>]*><svg/);
  });

  it("spends no banana: the rim is court-line white", () => {
    const html = renderToStaticMarkup(<PlayAnimation play={play} />);

    expect(html).not.toContain("banana");
  });
});
