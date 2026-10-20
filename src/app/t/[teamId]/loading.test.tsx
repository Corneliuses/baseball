import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SportProvider } from "@/components/SportProvider";

import TeamLoading from "./loading";
import { APP_NAME } from "@/lib/app-name";

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

    expect(html).not.toContain(APP_NAME);
    expect(html).not.toContain("<header");
  });

  it("dribbles inside a basketball team", () => {
    // The fallback has no data; the team layout's SportProvider is the only
    // way it learns the sport.
    const html = renderToStaticMarkup(
      <SportProvider sport="BASKETBALL">
        <TeamLoading />
      </SportProvider>,
    );

    expect(html).toContain("animate-dribble");
    expect(html).not.toContain("animate-spin-ball");
  });
});
