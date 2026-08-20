import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InstallPrompt, isIos } from "./InstallPrompt";

/**
 * Almost every case this component handles ends in rendering nothing, and each
 * of those is a different reason. The failure they guard against is the same
 * one either way: a card that nags someone who already installed the app, or an
 * Install button that does nothing when a parent taps it at a field.
 *
 * jsdom supplies none of the browser state this reads — no matchMedia, no
 * install event, a fixed user agent — so each test builds the phone it means to
 * describe.
 */

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

/// Stands up the browser conditions a test is describing: which phone, whether
/// the app is already on the home screen, and whether this one was dismissed
/// before.
function givenBrowser({
  userAgent = ANDROID_CHROME,
  standalone = false,
  dismissed = false,
  maxTouchPoints = 0,
}: {
  userAgent?: string;
  standalone?: boolean;
  dismissed?: boolean;
  maxTouchPoints?: number;
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
    window.localStorage.setItem("ybtm:install-prompt-dismissed", "1");
  }
}

/// Fires the Chromium install event the component waits for, and hands back the
/// spy standing in for the browser's install sheet.
function fireBeforeInstallPrompt() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt"), { prompt });
  window.dispatchEvent(event);
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
  it("says nothing until the browser says it can install", () => {
    givenBrowser();

    const { container } = render(<InstallPrompt />);

    // No beforeinstallprompt has fired, so there is no working Install button
    // to offer — and a button that does nothing is worse than no card.
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when the app is already on the home screen", () => {
    givenBrowser({ standalone: true });

    const { container } = render(<InstallPrompt />);
    fireBeforeInstallPrompt();

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden on iOS when the app is already on the home screen", () => {
    givenBrowser({ userAgent: IPHONE, standalone: true });

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden once it has been dismissed", () => {
    givenBrowser({ userAgent: IPHONE, dismissed: true });

    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  // Safari exposes no install API whatsoever, so the Share-sheet steps are the
  // only thing that can be offered — and they are undiscoverable otherwise.
  it("gives iOS the Share-sheet steps and no Install button", () => {
    givenBrowser({ userAgent: IPHONE });

    render(<InstallPrompt />);

    expect(screen.getByText(/Share menu/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it("offers a real Install button once Chromium fires the event", async () => {
    givenBrowser();

    render(<InstallPrompt />);
    const prompt = fireBeforeInstallPrompt();

    const button = await screen.findByRole("button", { name: /^install$/i });
    await userEvent.click(button);

    expect(prompt).toHaveBeenCalled();
  });

  it("puts the card away after the install sheet has been shown", async () => {
    givenBrowser();

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

    const { container } = render(<InstallPrompt />);
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));

    expect(container).toBeEmptyDOMElement();
    expect(
      window.localStorage.getItem("ybtm:install-prompt-dismissed"),
    ).toBe("1");
  });

  it("hides itself when the app is installed by another route", async () => {
    givenBrowser();

    const { container } = render(<InstallPrompt />);
    fireBeforeInstallPrompt();
    await screen.findByRole("button", { name: /^install$/i });

    // Chrome's own menu can install the app without the card being touched.
    window.dispatchEvent(new Event("appinstalled"));

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
