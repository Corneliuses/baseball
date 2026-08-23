import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `public/sw.js` is a static file the browser loads directly — nothing in the
 * app imports it, so nothing typechecks it and nothing else would catch a
 * change that breaks it.
 *
 * The stake is specific and asymmetric. Its `push` handler must call
 * `showNotification` on **every** invocation, including a malformed one: on
 * iOS a push event that resolves without showing anything can cost the site
 * its push permission outright, and a permission lost that way is not
 * recoverable from inside the app. So the handler is exercised here against
 * the payloads a real push service can actually deliver, rather than only the
 * one the app sends.
 *
 * The file is evaluated with a stubbed `self`, which is also how the "no
 * `fetch` handler" rule (Decision 9) becomes testable rather than a comment.
 */

type Listener = (event: unknown) => void;

function loadServiceWorker() {
  const source = readFileSync(
    join(process.cwd(), "public", "sw.js"),
    "utf8",
  );

  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue([]);

  const workerSelf = {
    addEventListener: (type: string, handler: Listener) => {
      listeners.set(type, handler);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll, openWindow },
    registration: { showNotification },
  };

  new Function("self", source)(workerSelf);

  return { listeners, showNotification, openWindow, matchAll };
}

/// A push event whose `data.json()` returns whatever the service sent.
function pushEvent(json: () => unknown) {
  const waited: unknown[] = [];
  return {
    event: { data: { json }, waitUntil: (value: unknown) => waited.push(value) },
    waited,
  };
}

let sw: ReturnType<typeof loadServiceWorker>;

beforeEach(() => {
  sw = loadServiceWorker();
});

describe("public/sw.js", () => {
  it("registers no fetch handler — Decision 9, and not negotiable", () => {
    // Every page under /t/[teamId] is a different family's roster, so a cache
    // keyed on URL alone would hand one signed-in parent's data to the next
    // person on a shared phone.
    expect(sw.listeners.has("fetch")).toBe(false);
    expect([...sw.listeners.keys()].sort()).toEqual([
      "activate",
      "install",
      "notificationclick",
      "push",
    ]);
  });

  it("shows the notification the app sent", () => {
    const { event } = pushEvent(() => ({
      title: "[Sharks] Today: Game vs Hawks, 5:30 PM",
      body: "5:30 PM at Riverside Field 2",
      url: "/t/team-1/schedule/evt-1",
    }));

    sw.listeners.get("push")!(event);

    expect(sw.showNotification).toHaveBeenCalledWith(
      "[Sharks] Today: Game vs Hawks, 5:30 PM",
      expect.objectContaining({
        body: "5:30 PM at Riverside Field 2",
        data: { url: "/t/team-1/schedule/evt-1" },
      }),
    );
  });

  // The whole point: none of these may produce a silent push.
  it.each([
    ["a null body", () => null],
    ["a bare string", () => "just text"],
    ["a number", () => 42],
    ["an array", () => []],
    ["unparseable JSON", () => { throw new SyntaxError("Unexpected token"); }],
    ["an empty object", () => ({})],
  ])("still notifies on %s", (_label, json) => {
    const { event } = pushEvent(json as () => unknown);

    expect(() => sw.listeners.get("push")!(event)).not.toThrow();
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    expect(sw.showNotification.mock.calls[0][0]).toBeTruthy();
    expect(sw.showNotification.mock.calls[0][1].body).toBeTruthy();
  });

  it("notifies even with no data at all", () => {
    const waited: unknown[] = [];
    sw.listeners.get("push")!({
      data: null,
      waitUntil: (value: unknown) => waited.push(value),
    });

    expect(sw.showNotification).toHaveBeenCalledTimes(1);
  });

  it("holds the event open until the notification is shown", () => {
    const { event, waited } = pushEvent(() => ({ title: "x", body: "y" }));

    sw.listeners.get("push")!(event);

    // Without waitUntil the worker may be killed mid-show, which is the other
    // route to a push that displays nothing.
    expect(waited).toHaveLength(1);
  });

  it("opens the deep link when there is no window to focus", async () => {
    const close = vi.fn();
    const waited: Promise<unknown>[] = [];

    sw.listeners.get("notificationclick")!({
      notification: { close, data: { url: "/t/team-1/schedule/evt-1" } },
      waitUntil: (value: Promise<unknown>) => waited.push(value),
    });

    await Promise.all(waited);

    expect(close).toHaveBeenCalled();
    expect(sw.openWindow).toHaveBeenCalledWith("/t/team-1/schedule/evt-1");
  });

  it("focuses an already-open tab rather than stacking another", async () => {
    const focus = vi.fn();
    sw.matchAll.mockResolvedValue([
      { url: "/t/team-1/schedule/evt-1", focus },
    ]);
    const waited: Promise<unknown>[] = [];

    sw.listeners.get("notificationclick")!({
      notification: { close: vi.fn(), data: { url: "/t/team-1/schedule/evt-1" } },
      waitUntil: (value: Promise<unknown>) => waited.push(value),
    });

    await Promise.all(waited);

    expect(focus).toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("falls back to the root when a notification carries no url", async () => {
    const waited: Promise<unknown>[] = [];

    sw.listeners.get("notificationclick")!({
      notification: { close: vi.fn(), data: null },
      waitUntil: (value: Promise<unknown>) => waited.push(value),
    });

    await Promise.all(waited);

    expect(sw.openWindow).toHaveBeenCalledWith("/");
  });
});
