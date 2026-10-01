import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import RootLoading from "./loading";

describe("root loading state", () => {
  it("shows the spinning ball", () => {
    const html = renderToStaticMarkup(<RootLoading />);

    expect(html).toContain("animate-spin-ball");
    expect(html).toContain('role="status"');
  });

  it("keeps the app header on screen while the next page loads", () => {
    // The root layout paints no chrome — every page brings PageContainer
    // itself — so a bare fallback here would blank the header band for the
    // length of the navigation and bring it back with the page.
    const html = renderToStaticMarkup(<RootLoading />);

    expect(html).toContain("<header");
    expect(html).toContain("Youth Baseball Team Manager");
  });
});
