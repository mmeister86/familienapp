"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { notificationValidator } from "./lib/notifications";

// Send one notification to every push subscription of a user. This file uses
// the Node runtime ("use node") because web-push needs node:crypto/node:https.
// Always triggered via ctx.scheduler.runAfter(0, …): the triggering mutation
// only schedules, it never blocks on delivery and never fails because of push.
//
// Env vars (set with `npx convex env set`):
// - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — the server's VAPID keypair
//   (`pnpm dlx web-push generate-vapid-keys`). Missing keys: skip silently.
// - VAPID_SUBJECT — optional contact URL (mailto:), has a sane default.
export const sendToUser = internalAction({
  args: { userId: v.id("users"), notification: notificationValidator },
  returns: v.object({ sent: v.number(), pruned: v.number() }),
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      console.warn(
        "[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set; skipping notification",
      );
      return { sent: 0, pruned: 0 };
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:familienapp@matthias.lol",
      publicKey,
      privateKey,
    );

    const subscriptions = await ctx.runQuery(internal.push.listByUser, {
      userId: args.userId,
    });
    const payload = JSON.stringify(args.notification);
    let sent = 0;
    let pruned = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 3600 },
        );
        sent += 1;
      } catch (error) {
        // 404/410: the subscription is gone (browser cleaned up, push
        // service expired it) — remove it so future sends stay fast.
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await ctx.runMutation(internal.push.deleteByEndpoint, {
            endpoint: subscription.endpoint,
          });
          pruned += 1;
        } else {
          console.warn(
            `[push] send failed (status ${String(statusCode ?? "unknown")}), keeping subscription`,
            error,
          );
        }
      }
    }
    return { sent, pruned };
  },
});
