import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusBanner } from "./StatusBanner";

describe("StatusBanner roles", () => {
  it("announces a success politely", () => {
    const html = renderToStaticMarkup(
      <StatusBanner tone="success">Event added.</StatusBanner>,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Event added.");
  });

  it("interrupts for a failure", () => {
    // role="alert" cuts into whatever a screen reader is saying. That is right
    // for "that didn't work" and wrong for "saved", which is why tone picks
    // the role and the palette together and neither can be set alone.
    const html = renderToStaticMarkup(
      <StatusBanner tone="error">Location is too long.</StatusBanner>,
    );

    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
});

describe("StatusBanner appearance", () => {
  it("draws the success tick rather than just showing it", () => {
    // design-plan.md §8 specified this flourish in the original redesign and
    // it shipped unbuilt. animate-tick sweeps CheckIcon's polyline.
    const html = renderToStaticMarkup(
      <StatusBanner tone="success">Saved.</StatusBanner>,
    );

    expect(html).toContain("animate-tick");
  });

  it("does not tick at a failure", () => {
    const html = renderToStaticMarkup(
      <StatusBanner tone="error">Nothing was sent.</StatusBanner>,
    );

    expect(html).not.toContain("animate-tick");
  });

  it("keeps its message legible in the raw server markup", () => {
    // Same rule as Reveal and animate-rise: this app is read at a field on one
    // bar of signal, so nothing may hide content until a bundle arrives. The
    // entrance is a translate-only CSS animation for exactly that reason.
    const html = renderToStaticMarkup(
      <StatusBanner tone="success">12 invitations sent.</StatusBanner>,
    );

    expect(html).toContain("12 invitations sent.");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("display:none");
    expect(html).not.toContain("visibility:hidden");
  });
});

describe("StatusBanner wiring", () => {
  it("takes an id so a field can point at it with aria-describedby", () => {
    const html = renderToStaticMarkup(
      <StatusBanner tone="error" id="name-error">
        Player name is required.
      </StatusBanner>,
    );

    expect(html).toContain('id="name-error"');
  });

  it("renders rich content, not only a sentence", () => {
    // The bulk invite's result is a list of named rows, not one line.
    const html = renderToStaticMarkup(
      <StatusBanner tone="success">
        <ul>
          <li>Maya R.</li>
        </ul>
      </StatusBanner>,
    );

    expect(html).toContain("<li>Maya R.</li>");
  });
});
