import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FieldArt } from "./FieldArt";

/// The fence is the only thing this component draws that a caller gets to
/// decide, because it is the only thing loud enough to be a screen's one
/// banana (design-plan.md §2). These pin that it is genuinely switchable and
/// that the default did not move — the positions editor passes nothing.
const markup = (element: React.ReactElement) =>
  renderToStaticMarkup(<svg>{element}</svg>);

describe("FieldArt fence", () => {
  it("paints a banana fence by default", () => {
    // The editor renders <FieldArt /> with no props and must keep the yellow
    // wall it has always had.
    expect(markup(<FieldArt />)).toContain("stroke-banana");
  });

  it("paints a banana fence when asked for one explicitly", () => {
    expect(markup(<FieldArt fence="banana" />)).toContain("stroke-banana");
  });

  it("paints a chalk fence and spends no banana when asked for chalk", () => {
    // The whole point of #49's Decision 1: /view hands its banana to the
    // reader's own child, so this component must leave none behind.
    const html = markup(<FieldArt fence="chalk" />);

    expect(html).toContain("stroke-chalk");
    expect(html).not.toContain("stroke-banana");
  });

  it("changes nothing but the fence between the two", () => {
    // A guard against the prop quietly growing a second job — the field is
    // shared geometry between the viewer and the editor, and a field one page
    // paints differently is its own kind of bug.
    const banana = markup(<FieldArt fence="banana" />);
    const chalk = markup(<FieldArt fence="chalk" />);

    expect(chalk.replace("stroke-chalk", "stroke-banana")).toBe(banana);
  });
});
