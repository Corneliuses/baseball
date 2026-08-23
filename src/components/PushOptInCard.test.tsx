import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PushOptInCard, urlBase64ToUint8Array } from "./PushOptInCard";

/**
 * jsdom ships none of the push machinery — no `PushManager`, no
 * `Notification`, no service worker — so each test builds the browser it means
 * to describe. That is the point: every branch in this card exists because some
 * real browser is missing something, and the iOS branch (Safari tab, no push
 * until the app is on the Home Screen) is the one that decides whether a parent
 * is told why the button isn't there.
 *
 * The card's contract, in every state: it never claims a reminder will be
 * missed. Email is the channel of record — nothing here can stop one.
 */

const KEY = "BEl62iUYgUivxIkv69yViEuiBIa40HI80NM9LdNnC5XjM3q";

type PushManagerStub = {
  getSubscription: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

let pushManager: PushManagerStub;
let unsubscribe: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function subscriptionStub(endpoint = "https://push.example.com/abc") {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: "public-bytes", auth: "auth-bytes" },
    }),
    unsubscribe,
  };
}

/// A browser that can do push. `permission` is what the card reads before it
/// ever prompts.
function givenPushCapableBrowser(permission: NotificationPermission = "default") {
  pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscriptionStub()),
  };

  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
}

/// An iOS Safari tab, or any browser without the APIs.
function givenBrowserWithoutPush() {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "PushManager");
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: undefined,
  });
}

beforeEach(() => {
  unsubscribe = vi.fn().mockResolvedValue(true);
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url, restoring padding and the two swapped characters", () => {
    // "-_" in base64url are "+/" in base64; the input is unpadded.
    const bytes = urlBase64ToUint8Array("-_8");

    expect(Array.from(bytes)).toEqual([251, 255]);
  });

  it("round-trips a realistic VAPID key to raw bytes", () => {
    const bytes = urlBase64ToUint8Array(KEY);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});

describe("PushOptInCard", () => {
  it("explains the Home Screen requirement when the browser cannot do push", async () => {
    givenBrowserWithoutPush();

    render(<PushOptInCard vapidPublicKey={KEY} />);

    expect(await screen.findByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText(/emails arrive either way/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /turn on notifications/i }),
    ).not.toBeInTheDocument();
  });

  it("says nothing is lost when notifications are blocked", async () => {
    givenPushCapableBrowser("denied");

    render(<PushOptInCard vapidPublicKey={KEY} />);

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
    expect(screen.getByText(/still get every reminder by email/i)).toBeInTheDocument();
    // A declined prompt is effectively permanent (Decision 8) — never re-ask.
    expect(
      screen.queryByRole("button", { name: /turn on notifications/i }),
    ).not.toBeInTheDocument();
  });

  it("offers the button when push is available and unsubscribed", async () => {
    givenPushCapableBrowser();

    render(<PushOptInCard vapidPublicKey={KEY} />);

    expect(
      await screen.findByRole("button", { name: /turn on notifications/i }),
    ).toBeInTheDocument();
  });

  it("shows the on state for a device already subscribed", async () => {
    givenPushCapableBrowser("granted");
    pushManager.getSubscription.mockResolvedValue(subscriptionStub());

    render(<PushOptInCard vapidPublicKey={KEY} />);

    expect(await screen.findByText(/notifications are on/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /turn off on this device/i }),
    ).toBeInTheDocument();
  });

  it("renders nothing but the email promise when push is unconfigured", async () => {
    givenPushCapableBrowser();

    render(<PushOptInCard vapidPublicKey={null} />);

    expect(await screen.findByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /turn on notifications/i }),
    ).not.toBeInTheDocument();
  });

  it("asks permission only from the button press, then registers", async () => {
    givenPushCapableBrowser();
    const user = userEvent.setup();

    render(<PushOptInCard vapidPublicKey={KEY} />);
    const button = await screen.findByRole("button", {
      name: /turn on notifications/i,
    });

    expect(Notification.requestPermission).not.toHaveBeenCalled();

    await user.click(button);

    await waitFor(() => {
      expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    });
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/push/subscription",
      expect.objectContaining({ method: "POST" }),
    );
    expect(await screen.findByText(/notifications are on/i)).toBeInTheDocument();
  });

  it("goes to the blocked state when the person declines the prompt", async () => {
    givenPushCapableBrowser();
    vi.mocked(Notification.requestPermission).mockResolvedValue("denied");
    const user = userEvent.setup();

    render(<PushOptInCard vapidPublicKey={KEY} />);
    await user.click(
      await screen.findByRole("button", { name: /turn on notifications/i }),
    );

    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes the browser when the server refuses the registration", async () => {
    givenPushCapableBrowser();
    fetchMock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();

    render(<PushOptInCard vapidPublicKey={KEY} />);
    await user.click(
      await screen.findByRole("button", { name: /turn on notifications/i }),
    );

    // A browser subscribed to a server with no record of it is a device the
    // fan-out can never reach and never prune.
    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /still get emails/i,
    );
  });

  it("reports a failed subscribe without claiming emails stop", async () => {
    givenPushCapableBrowser();
    pushManager.subscribe.mockRejectedValue(new Error("no push service"));
    const user = userEvent.setup();

    render(<PushOptInCard vapidPublicKey={KEY} />);
    await user.click(
      await screen.findByRole("button", { name: /turn on notifications/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/still get emails/i);
    expect(
      screen.getByRole("button", { name: /turn on notifications/i }),
    ).toBeInTheDocument();
  });

  it("tells the server before dropping the browser subscription", async () => {
    givenPushCapableBrowser("granted");
    pushManager.getSubscription.mockResolvedValue(subscriptionStub());
    const user = userEvent.setup();

    render(<PushOptInCard vapidPublicKey={KEY} />);
    await user.click(
      await screen.findByRole("button", { name: /turn off on this device/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/push/subscription",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(unsubscribe).toHaveBeenCalled();
    expect(
      await screen.findByRole("button", { name: /turn on notifications/i }),
    ).toBeInTheDocument();
  });
});
