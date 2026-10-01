import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TeamLoading from "./loading";

describe("team loading state", () => {
  it("shows the spinning ball", () => {
    const html = renderToStaticMarkup(<TeamLoading />);

    expect(html).toContain("animate-spin-ball");
    expect(html).toContain('role="status"');
  });

  it("draws no page chrome of its own", () => {
    // This renders inside /t/[teamId]/layout.tsx, which already paints the
    // app header band — a fallback carrying PageContainer would show two of
    // them for the length of every navigation.
    const html = renderToStaticMarkup(<TeamLoading />);

    expect(html).not.toContain("Youth Baseball Team Manager");
    expect(html).not.toContain("<header");
  });
});
