import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BasketballSpinner } from "./BasketballSpinner";

describe("BasketballSpinner", () => {
  it("dribbles, and is hidden from assistive tech", () => {
    // The label beside it is the accessible signal; the ball is decoration.
    const html = renderToStaticMarkup(<BasketballSpinner />);

    expect(html).toContain("animate-dribble");
    expect(html).not.toContain("animate-spin-ball");
    expect(html).toContain('aria-hidden="true"');
  });

  it("draws in currentColor so it reads on any button", () => {
    const html = renderToStaticMarkup(<BasketballSpinner />);

    expect(html).toContain('stroke="currentColor"');
  });

  it("colours all four seams with seamClassName, and not the outline", () => {
    const html = renderToStaticMarkup(
      <BasketballSpinner className="size-14" seamClassName="stroke-destructive" />,
    );

    expect(html).toContain("size-14");
    expect(html.match(/stroke-destructive/g)).toHaveLength(4);
    expect(html).toMatch(/<circle(?![^>]*stroke-destructive)[^>]*>/);
  });
});
