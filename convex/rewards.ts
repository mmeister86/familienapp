import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireParent, requireUser } from "./lib/auth";

const MAX_TITLE_LENGTH = 200;
const MAX_EMOJI_LENGTH = 10;
const MIN_COST = 1;
const MAX_COST = 100000;

// A reward document. The rewards table is tiny (a handful of rows), so
// queries use a full collect plus an Array sort by title.
const rewardValidator = v.object({
  _id: v.id("rewards"),
  _creationTime: v.number(),
  title: v.string(),
  emoji: v.optional(v.string()),
  cost: v.number(),
  active: v.boolean(),
});

// A redemption plus the resolved reward title/emoji and the public user
// projection (no PIN fields) for the Rewards/Approvals screens.
const redemptionItemValidator = v.object({
  _id: v.id("redemptions"),
  _creationTime: v.number(),
  rewardId: v.id("rewards"),
  userId: v.id("users"),
  costSnapshot: v.number(),
  status: v.union(
    v.literal("requested"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
  requestedAt: v.number(),
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  rewardTitle: v.string(),
  rewardEmoji: v.optional(v.string()),
  userSlug: v.optional(v.string()),
  userName: v.optional(v.string()),
  userColor: v.optional(v.string()),
  userEmoji: v.optional(v.string()),
});

type RedemptionItem = Infer<typeof redemptionItemValidator>;

// Trim and check the title; returns the normalized (trimmed) title.
function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_TITLE_LENGTH) {
    throw new ConvexError(
      `Title must be 1..${String(MAX_TITLE_LENGTH)} characters`,
    );
  }
  return trimmed;
}

// Trim the emoji; an empty result clears it to undefined. Stored as-is
// (no emoji-format validation).
function normalizeEmoji(emoji: string | undefined): string | undefined {
  if (emoji === undefined) {
    return undefined;
  }
  const trimmed = emoji.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length > MAX_EMOJI_LENGTH) {
    throw new ConvexError(
      `Emoji must be at most ${String(MAX_EMOJI_LENGTH)} characters`,
    );
  }
  return trimmed;
}

// Cost must be an integer in [1, 100000].
function validateCost(cost: number): void {
  if (!Number.isInteger(cost) || cost < MIN_COST || cost > MAX_COST) {
    throw new ConvexError(
      `Cost must be an integer between ${String(MIN_COST)} and ${String(MAX_COST)}`,
    );
  }
}

// Balance = sum of deltas over by_user. Mirrors points.sumBalance with a
// direct db read so reward checks never call across modules.
async function sumBalance(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<number> {
  const transactions = await db
    .query("pointTransactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return transactions.reduce((sum, t) => sum + t.delta, 0);
}

// Sum of the costs of the user's requested (not yet reviewed) redemptions.
async function sumRequested(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<number> {
  const redemptions = await db
    .query("redemptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return redemptions
    .filter((r) => r.status === "requested")
    .reduce((sum, r) => sum + r.costSnapshot, 0);
}

// Enrich a redemption with the reward title/emoji and the public user
// projection. Returns null for orphaned redemptions (reward deleted); the
// cascade delete in `remove` makes these impossible, but stay defensive.
async function toItem(
  db: DatabaseReader,
  redemption: Doc<"redemptions">,
): Promise<RedemptionItem | null> {
  const reward = await db.get(redemption.rewardId);
  if (reward === null) {
    return null;
  }
  const item: RedemptionItem = {
    ...redemption,
    rewardTitle: reward.title,
    rewardEmoji: reward.emoji,
  };
  const user = await db.get(redemption.userId);
  if (user !== null) {
    item.userSlug = user.slug;
    item.userName = user.name;
    item.userColor = user.color;
    item.userEmoji = user.emoji;
  }
  return item;
}

// Create a reward (parent only). Active is always true on create.
export const create = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    emoji: v.optional(v.string()),
    cost: v.number(),
  },
  returns: v.object({ rewardId: v.id("rewards") }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const title = normalizeTitle(args.title);
    const emoji = normalizeEmoji(args.emoji);
    validateCost(args.cost);
    const rewardId = await ctx.db.insert("rewards", {
      title,
      emoji,
      cost: args.cost,
      active: true,
    });
    return { rewardId };
  },
});

// Update a reward (parent only). Pass null to clear the emoji. Title/cost
// changes affect only future requests; past redemptions keep their
// costSnapshot (audit trail).
export const update = mutation({
  args: {
    token: v.string(),
    rewardId: v.id("rewards"),
    title: v.optional(v.string()),
    emoji: v.optional(v.union(v.string(), v.null())),
    cost: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const reward = await ctx.db.get(args.rewardId);
    if (reward === null) {
      throw new ConvexError("Reward not found");
    }
    const patch: {
      title?: string;
      emoji?: string;
      cost?: number;
      active?: boolean;
    } = {};
    if (args.title !== undefined) {
      patch.title = normalizeTitle(args.title);
    }
    if (args.emoji !== undefined) {
      patch.emoji =
        args.emoji === null ? undefined : normalizeEmoji(args.emoji);
    }
    if (args.cost !== undefined) {
      validateCost(args.cost);
      patch.cost = args.cost;
    }
    if (args.active !== undefined) {
      patch.active = args.active;
    }
    await ctx.db.patch(reward._id, patch);
    return { ok: true };
  },
});

// Hard delete a reward and ALL its redemptions of any status (parent only).
// Booked pointTransactions keep their plain-string refId as an audit trail.
export const remove = mutation({
  args: { token: v.string(), rewardId: v.id("rewards") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const reward = await ctx.db.get(args.rewardId);
    if (reward === null) {
      throw new ConvexError("Reward not found");
    }
    const statuses = ["requested", "approved", "rejected"] as const;
    for (const status of statuses) {
      const redemptions = await ctx.db
        .query("redemptions")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const redemption of redemptions) {
        if (redemption.rewardId === reward._id) {
          await ctx.db.delete(redemption._id);
        }
      }
    }
    await ctx.db.delete(reward._id);
    return { ok: true };
  },
});

// Request a reward (child only). Requires available balance >= cost;
// multiple open requests for the same reward are allowed and each one
// blocks its cost from `available`.
export const request = mutation({
  args: { token: v.string(), rewardId: v.id("rewards") },
  returns: v.object({ redemptionId: v.id("redemptions") }),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    if (caller.role !== "child") {
      throw new ConvexError("Only children can request rewards");
    }
    const reward = await ctx.db.get(args.rewardId);
    if (reward === null) {
      throw new ConvexError("Reward not found");
    }
    if (!reward.active) {
      throw new ConvexError("Reward is not available");
    }
    const available =
      (await sumBalance(ctx.db, caller._id)) -
      (await sumRequested(ctx.db, caller._id));
    if (available < reward.cost) {
      throw new ConvexError("Not enough points");
    }
    const redemptionId = await ctx.db.insert("redemptions", {
      rewardId: reward._id,
      userId: caller._id,
      costSnapshot: reward.cost,
      status: "requested",
      requestedAt: Date.now(),
    });
    return { redemptionId };
  },
});

// Approve a requested redemption (parent only): mark approved and book the
// debit unconditionally. The note snapshots the reward title at approval time.
export const approveRedemption = mutation({
  args: { token: v.string(), redemptionId: v.id("redemptions") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const redemption = await ctx.db.get(args.redemptionId);
    if (redemption === null) {
      throw new ConvexError("Redemption not found");
    }
    if (redemption.status !== "requested") {
      throw new ConvexError("Only requested redemptions can be approved");
    }
    const reward = await ctx.db.get(redemption.rewardId);
    if (reward === null) {
      throw new ConvexError("Reward not found");
    }
    const now = Date.now();
    await ctx.db.patch(redemption._id, {
      status: "approved",
      reviewedBy: caller._id,
      reviewedAt: now,
    });
    await ctx.db.insert("pointTransactions", {
      userId: redemption.userId,
      delta: -redemption.costSnapshot,
      reason: "reward",
      refId: redemption._id,
      note: reward.title,
      createdBy: caller._id,
      createdAt: now,
    });
    return { ok: true };
  },
});

// Reject a requested redemption (parent only): mark rejected, book nothing.
export const rejectRedemption = mutation({
  args: { token: v.string(), redemptionId: v.id("redemptions") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const redemption = await ctx.db.get(args.redemptionId);
    if (redemption === null) {
      throw new ConvexError("Redemption not found");
    }
    if (redemption.status !== "requested") {
      throw new ConvexError("Only requested redemptions can be rejected");
    }
    await ctx.db.patch(redemption._id, {
      status: "rejected",
      reviewedBy: caller._id,
      reviewedAt: Date.now(),
    });
    return { ok: true };
  },
});

// All rewards ordered by title (parents); kids only get active rewards.
export const list = query({
  args: { token: v.string() },
  returns: v.array(rewardValidator),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    // The rewards table is tiny; a full collect is intentional (no index).
    const rewards = await ctx.db.query("rewards").collect();
    const visible =
      caller.role === "parent" ? rewards : rewards.filter((r) => r.active);
    visible.sort((a, b) => a.title.localeCompare(b.title));
    return visible;
  },
});

// The caller's own redemptions of any status, newest request first.
export const listMine = query({
  args: { token: v.string() },
  returns: v.array(redemptionItemValidator),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_user", (q) => q.eq("userId", caller._id))
      .collect();
    const items: RedemptionItem[] = [];
    for (const redemption of redemptions) {
      const item = await toItem(ctx.db, redemption);
      if (item !== null) {
        items.push(item);
      }
    }
    items.sort((a, b) => b.requestedAt - a.requestedAt);
    return items;
  },
});

// All requested redemptions for the Approvals screen (parent only),
// oldest request first.
export const listRequested = query({
  args: { token: v.string() },
  returns: v.array(redemptionItemValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();
    const items: RedemptionItem[] = [];
    for (const redemption of redemptions) {
      const item = await toItem(ctx.db, redemption);
      if (item !== null) {
        items.push(item);
      }
    }
    items.sort((a, b) => a.requestedAt - b.requestedAt);
    return items;
  },
});
