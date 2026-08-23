import { z } from "zod";

/// The browser's `PushSubscription.toJSON()` shape, validated before anything
/// reaches Prisma.
///
/// Pure and DB-free like the other decision modules in this directory. The
/// registration route is the one place in the app where a signed-in person
/// POSTs a JSON body of their own construction, so the shape is checked rather
/// than trusted: `endpoint` becomes a URL the server will later make requests
/// to, which is precisely the field not to take on faith.
///
/// `https:` only, for that reason — a subscription naming `http:` or, worse,
/// `file:` is not something any real push service hands out, and refusing it
/// keeps the stored endpoint list to addresses `web-push` can safely be
/// pointed at.

/// Push endpoints are long (FCM's run ~200 chars) but not unbounded; the cap
/// keeps a forged POST from writing a megabyte into a unique-indexed column.
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(MAX_ENDPOINT_LENGTH)
    .refine((value) => value.startsWith("https://"), {
      message: "Push endpoint must be an https: URL",
    }),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(MAX_KEY_LENGTH),
    auth: z.string().trim().min(1).max(MAX_KEY_LENGTH),
  }),
});

export type ParsedPushSubscription = z.infer<typeof pushSubscriptionSchema>;

/// The columns `PushSubscription` actually stores — flattened out of the
/// browser's nested `keys` object so the route never restates the mapping.
export type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type ParsePushSubscriptionResult =
  | { ok: true; subscription: PushSubscriptionRecord }
  | { ok: false; reason: string };

export function parsePushSubscription(
  input: unknown,
): ParsePushSubscriptionResult {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid-subscription" };
  }

  return {
    ok: true,
    subscription: {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
  };
}
