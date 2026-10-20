import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SportProvider, useSport } from "./SportProvider";

function Probe() {
  return <span>{useSport()}</span>;
}

describe("SportProvider", () => {
  it("defaults to baseball outside any provider", () => {
    // /profile and everything else outside /t/[teamId] lands here.
    expect(renderToStaticMarkup(<Probe />)).toContain("BASEBALL");
  });

  it("hands the team's sport to everything beneath it", () => {
    const html = renderToStaticMarkup(
      <SportProvider sport="BASKETBALL">
        <Probe />
      </SportProvider>,
    );

    expect(html).toContain("BASKETBALL");
  });
});
