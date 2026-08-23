import { parsePushSubscription } from "@/lib/push-subscription";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/// Push subscription registration (#47) — the Route Handler use case
/// `AGENTS.md` names explicitly, alongside the magic-link callback.
///
/// It has to be a real endpoint rather than a Server Action because the
/// subscription is produced by `pushManager.subscribe()` in the browser and
/// posted as JSON from client code; there is no form and no page to revalidate.
///
/// Both methods are session-authenticated and scoped to the caller. The
/// `DELETE` in particular matches on endpoint **and** `userId`, so one signed-in
/// person cannot unregister somebody else's device by guessing an endpoint —
/// the endpoint is unique across the table, which without the user filter
/// would make it a fine deletion key for anyone who learned one.
///
/// Not team-scoped, deliberately: a subscription belongs to a person and their
/// browser, exactly like the name and phone on `/profile`. `PushSubscription`
/// carries no `teamId`, and `requireTeamAccess` has nothing to check here.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = parsePushSubscription(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }

  const { endpoint, p256dh, auth } = parsed.subscription;

  try {
    // Upsert on the endpoint, which is unique across the table. A browser
    // hands back the same endpoint when it re-subscribes, and two people
    // signing in on one shared phone must not leave the first person's row
    // pointing at the second person's notifications — so the update moves
    // ownership rather than skipping.
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh, auth },
      update: { userId: user.id, p256dh, auth },
      select: { id: true },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to store push subscription:", detail);
    return Response.json({ error: "store-failed" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid-json" }, { status: 400 });
  }

  const endpoint =
    typeof body === "object" && body !== null
      ? (body as { endpoint?: unknown }).endpoint
      : undefined;

  if (typeof endpoint !== "string" || !endpoint) {
    return Response.json({ error: "invalid-subscription" }, { status: 400 });
  }

  try {
    // deleteMany, not delete: an endpoint that is already gone (pruned by the
    // fan-out after a 410) is a success, not a 500. The userId filter is the
    // authorization — see the module docstring.
    await db.pushSubscription.deleteMany({
      where: { endpoint, userId: user.id },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to remove push subscription:", detail);
    return Response.json({ error: "delete-failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
