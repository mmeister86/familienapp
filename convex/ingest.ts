import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { addDays, todayBerlin } from "./lib/dates";
import { briefingFields, childSnapshotFields } from "./lib/validators";

// Briefings older than this (measured by the day they are about) are deleted.
export const BRIEFING_RETENTION_DAYS = 14;

// Replace the snapshot of one child (upsert by childSlug). The slug must
// belong to an existing child user, otherwise the payload is invalid.
export const upsertChildSnapshot = internalMutation({
  args: childSnapshotFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const child = await ctx.db
      .query("users")
      .withIndex("by_slug", (q) => q.eq("slug", args.childSlug))
      .unique();
    if (child === null || child.role !== "child") {
      throw new ConvexError(`Unknown child slug: ${args.childSlug}`);
    }
    const existing = await ctx.db
      .query("childSnapshots")
      .withIndex("by_childSlug", (q) => q.eq("childSlug", args.childSlug))
      .unique();
    const doc = { ...args, receivedAt: Date.now() };
    if (existing === null) {
      await ctx.db.insert("childSnapshots", doc);
    } else {
      await ctx.db.replace(existing._id, doc);
    }
    return null;
  },
});

// Upsert a briefing by (date, kind).
export const upsertBriefing = internalMutation({
  args: briefingFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("briefings")
      .withIndex("by_date_kind", (q) =>
        q.eq("date", args.date).eq("kind", args.kind),
      )
      .first();
    const doc = { ...args, receivedAt: Date.now() };
    if (existing === null) {
      await ctx.db.insert("briefings", doc);
    } else {
      await ctx.db.replace(existing._id, doc);
    }
    return null;
  },
});

// Delete briefings older than the retention window (Berlin date compare).
// The table is bounded (≤ 2 × 14 rows), so a full collect is intentional.
export const cleanupBriefings = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const threshold = addDays(todayBerlin(), -BRIEFING_RETENTION_DAYS);
    const briefings = await ctx.db.query("briefings").collect();
    let deleted = 0;
    for (const briefing of briefings) {
      if (briefing.date < threshold) {
        await ctx.db.delete(briefing._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});
