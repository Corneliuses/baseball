import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { isIos } from "./InstallPrompt";

/**
 * Almost every case this component handles ends in rendering nothing, and each
 * of those is a different reason. The failure they guard against is the same
 * one either way: a card that nags someone who already installed the app, or an
 * Install button that does nothing when a parent taps it at a field.
 *
 * jsdom supplies none of the browser state this reads — no matchMedia, no
 * install event, a fixed user agent — so each test builds the phone it means to
 * describe.
 *
 * The component is imported fresh per test. `install-availability.ts` holds the
 * captured install offer in module scope on purpose (a window event that fires
 * once per document load cannot live in component state), so without
 * `resetModules` the event caught by one test would still be held for the next.
 * The usual objection to dynamic imports in tests — that the first test pays
 * for the whole module graph — does not apply to a card and two UI primitives.
 */

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

const TIP_KEY = "ybtm:install-tip-showings";
const DISMISSED_KEY = "ybtm:install-prompt-dismissed";

function givenBrowser({
  userAgent = ANDROID_CHROME,
  standalone = false,
  dismissed = false,
  maxTouchPoints = 0,
  iosTipShowings = 0,
}: {
  userAgent?: string;
  standalone?: boolean;
  dismissed?: boolean;
  maxTouchPoints?: number;
  iosTipShowings?: number;
} = {}) {
  // defineProperty rather than spyOn: jsdom defines neither of these as a
  // configurable getter, and does not define maxTouchPoints at all.
  Object.defineProperty(navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });

  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: standalone && query === "(display-mode: standalone)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    configurable: true,
    writable: true,
  });

  window.localStorage.clear();
  if (dismissed) {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  }
  if (iosTipShowings > 0) {
    window.localStorage.setItem(TIP_KEY, String(iosTipShowings));
  }
}

/// Loads the component and its store fresh, so the module-scope install offer
/// starts empty and the store's window listeners are attached for this test.
async function loadInstallPrompt() {
  vi.resetModules();
  const { InstallPrompt } = await import("./InstallPrompt");
  return InstallPrompt;
}

/// Fires the Chromium install event the store listens for, and hands back the
/// spy standing in for the browser's install sheet.
function fireBeforeInstallPrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  window.dispatchEvent(
    Object.assign(new Event("beforeinstallprompt"), { prompt }),
  );
  return prompt;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("isIos", () => {
  it("recognises iPhone and iPad", () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(isIos("Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X)")).toBe(true);
  });

  // iPadOS reports itself as a Mac in desktop-class Safari; the touch points
  // are the only thing separating it from an actual desktop Mac, which cannot
  // install this at all.
  it("recognises an iPad claiming to be a Mac, but not a real Mac", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1";
    expect(isIos(mac, 5)).toBe(true);
    expect(isIos(mac, 0)).toBe(false);
  });

  it("does not mistake Android for iOS", () => {
    expect(isIos(ANDROID_CHROME)).toBe(false);
  });
});

describe("InstallPrompt", () => {
  it("says nothing until the browser says it can install", async () => {
    givenBrowser();
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The regression this whole store exists for. Chromium fires
   * `beforeinstallprompt` once per document load, at the window. A parent lands
   * on `/`, signs in, and taps through to their team — a client-side
   * navigation, so the event has already come and gone by the time this card
   * first mounts. When the listener lived in this component, that meant the
   * Install button never appeared in the one flow everybody actually uses.
   */
  it("offers Install for an event that fired before it ever mounted", async () => {
    givenBrowser();
    const InstallPrompt = await loadInstallPrompt();

    const prompt = fireBeforeInstallPrompt();
    render(<InstallPrompt />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^install$/i }),
    );
    expect(prompt).toHaveBeenCalled();
  });

  it("offers Install for an event that arrives while it is mounted", async () => {
    givenBrowser();
    const InstallPrompt = await loadInstallPrompt();

    render(<InstallPrompt />);
    const prompt = fireBeforeInstallPrompt();

    await userEvent.click(
      await screen.findByRole("button", { name: /^install$/i }),
    );
    expect(prompt).toHaveBeenCalled();
  });

  it("stays hidden when the app is already on the home screen", async () => {
    givenBrowser({ standalone: true });
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);
    fireBeforeInstallPrompt();

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden on iOS when the app is already on the home screen", async () => {
    givenBrowser({ userAgent: IPHONE, standalone: true });
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden once it has been dismissed", async () => {
    givenBrowser({ userAgent: IPHONE, dismissed: true });
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  // Safari exposes no install API whatsoever, so the Share-sheet steps are the
  // only thing that can be offered — and they are undiscoverable otherwise.
  it("gives iOS the Share-sheet steps and no Install button", async () => {
    givenBrowser({ userAgent: IPHONE });
    const InstallPrompt = await loadInstallPrompt();

    render(<InstallPrompt />);

    expect(screen.getByText(/Share menu/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  /**
   * iOS fires no `appinstalled` and gives a Home Screen app its own storage
   * container, so a parent who follows the steps leaves no trace the Safari tab
   * can read. Counting the showings is the only thing standing between that and
   * a card that reappears forever for the people who already complied.
   */
  it("counts each iOS showing and gives up after the third", async () => {
    givenBrowser({ userAgent: IPHONE });
    const InstallPrompt = await loadInstallPrompt();

    render(<InstallPrompt />);
    expect(screen.getByText(/Share menu/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(TIP_KEY)).toBe("1");

    cleanup();
    givenBrowser({ userAgent: IPHONE, iosTipShowings: 3 });
    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  // The count is read once at mount. Reading it live would let the effect that
  // increments it pull the card out from under someone still reading it.
  it("does not vanish mid-visit when its own counter crosses the limit", async () => {
    givenBrowser({ userAgent: IPHONE, iosTipShowings: 2 });
    const InstallPrompt = await loadInstallPrompt();

    render(<InstallPrompt />);
    expect(window.localStorage.getItem(TIP_KEY)).toBe("3");
    // Force a re-render; the card must still be here.
    await userEvent.hover(screen.getByText(/Share menu/i));

    expect(screen.getByText(/Share menu/i)).toBeInTheDocument();
  });

  it("puts the card away after the install sheet has been shown", async () => {
    givenBrowser();
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);
    fireBeforeInstallPrompt();

    await userEvent.click(
      await screen.findByRole("button", { name: /^install$/i }),
    );

    // The captured event is single-use whichever way the person answered.
    expect(container).toBeEmptyDOMElement();
  });

  it("remembers Not now so the card does not come back", async () => {
    givenBrowser({ userAgent: IPHONE });
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));

    expect(container).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("hides itself when the app is installed by another route", async () => {
    givenBrowser();
    const InstallPrompt = await loadInstallPrompt();

    const { container } = render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    await screen.findByRole("button", { name: /^install$/i });

    // Chrome's own menu can install the app without the card being touched.
    window.dispatchEvent(new Event("appinstalled"));

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
