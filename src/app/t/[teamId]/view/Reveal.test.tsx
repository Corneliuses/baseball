import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Reveal } from "./Reveal";

/// Guards the one property that matters more than the animation itself: the
/// content must be readable straight from the server-rendered HTML, because
/// this page is read at a field on a bad connection. Motion serializes
/// `initial` into the markup, so an `opacity: 0` initial would ship a blank
/// chart until hydration.
describe("Reveal", () => {
  it("never hides its children in the server-rendered markup", () => {
    const html = renderToStaticMarkup(
      <Reveal>
        <p>Ava bats first</p>
      </Reveal>,
    );

    expect(html).toContain("Ava bats first");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("display:none");
    expect(html).not.toContain("visibility:hidden");
  });
});
