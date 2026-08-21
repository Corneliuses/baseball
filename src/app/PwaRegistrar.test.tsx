import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { PwaRegistrar } from "./PwaRegistrar";

/**
 * Registration is invisible when it works and invisible when it doesn't, which
 * is the whole problem: nothing renders, so nothing here would ever be caught
 * by eye or by another test. What matters is that it asks for the right script
 * with the right cache option, and that neither an unsupporting browser nor an
 * outright failure takes the page down with it — a parent who never installs
 * must get exactly the same working app.
 */

const register = vi.fn();

/// jsdom implements no service worker at all, so `navigator.serviceWorker` is
/// installed and removed per test rather than stubbed once. `configurable` is
/// what lets it be deleted again afterwards.
function withServiceWorker() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register },
    configurable: true,
  });
}

function withoutServiceWorker() {
  Reflect.deleteProperty(navigator, "serviceWorker");
}

beforeEach(() => {
  vi.clearAllMocks();
  register.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  withoutServiceWorker();
  vi.restoreAllMocks();
});

describe("PwaRegistrar", () => {
  it("registers the service worker at the app root", () => {
    withServiceWorker();

    render(<PwaRegistrar />);

    expect(register).toHaveBeenCalledWith(
      "/sw.js",
      expect.objectContaining({ scope: "/" }),
    );
  });

  // The option that keeps a browser from serving this script out of its own
  // HTTP cache for up to 24 hours while checking for an update. Harmless while
  // the worker is empty; the difference between receiving a push and silently
  // receiving nothing once it isn't.
  it("opts out of the browser cache when checking for updates", () => {
    withServiceWorker();

    render(<PwaRegistrar />);

    expect(register).toHaveBeenCalledWith(
      "/sw.js",
      expect.objectContaining({ updateViaCache: "none" }),
    );
  });

  it("renders nothing", () => {
    withServiceWorker();

    const { container } = render(<PwaRegistrar />);

    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing in a browser with no service worker support", () => {
    withoutServiceWorker();

    expect(() => render(<PwaRegistrar />)).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it("swallows a failed registration instead of breaking the page", async () => {
    withServiceWorker();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    register.mockRejectedValue(new Error("insecure context"));

    render(<PwaRegistrar />);
    // Let the rejected registration settle so an unhandled rejection would
    // surface here rather than in some later, unrelated test.
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});
