import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireUser } from "./lib/auth";

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

// Push service endpoints and keys are opaque URLs/strings; only sane length
// bounds are enforced (they are never interpreted server-side).
function validateSubscriptionFields(
  endpoint: string,
  p256dh: string,
  auth: string,
): void {
  if (endpoint.length < 1 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    throw new ConvexError(
      `Endpoint must be 1..${String(MAX_ENDPOINT_LENGTH)} characters`,
    );
  }
  for (const key of [p256dh, auth]) {
    if (key.length < 1 || key.length > MAX_KEY_LENGTH) {
      throw new ConvexError(
        `Subscription keys must be 1..${String(MAX_KEY_LENGTH)} characters`,
      );
    }
  }
}

// Public VAPID key for the subscription flow. null (never throws) when the
// server has no keys configured — the UI then shows "not configured".
export const config = query({
  args: { token: v.string() },
  returns: v.object({ vapidPublicKey: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await requireUser(ctx, args.token);
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    return { vapidPublicKey: publicKey ?? null };
  },
});

// Upsert this device's push subscription (by endpoint, the natural unique
// key). Re-subscribing the same endpoint re-binds it to the caller and
// refreshes the keys (they rotate on every pushManager.subscribe).
export const subscribe = mutation({
  args: {
    token: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    validateSubscriptionFields(args.endpoint, args.p256dh, args.auth);

    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        userId: caller._id,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
      });
      return { ok: true };
    }

    await ctx.db.insert("pushSubscriptions", {
      userId: caller._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// Remove this device's subscription. Only the owner (or anyone while the
// endpoint is unknown) may delete it: endpoints are never returned across
// users, so ownership is enforced on the matched row.
export const unsubscribe = mutation({
  args: { token: v.string(), endpoint: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing !== null && existing.userId !== caller._id) {
      throw new ConvexError("Not your subscription");
    }
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return { ok: true };
  },
});

// All subscriptions of one user, for the sender action. Internal only.
export const listByUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      endpoint: v.string(),
      p256dh: v.string(),
      auth: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return subs.map((sub) => ({
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    }));
  },
});

// Drop a dead subscription (push service returned 404/410). Internal only,
// called by the sender action.
export const deleteByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
