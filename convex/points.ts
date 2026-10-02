import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireParent, requireUser } from "./lib/auth";

const MAX_ADJUST_ABS = 10000;
const MAX_ADJUST_NOTE_LENGTH = 200;

// A point transaction plus the resolved creator name for display.
const transactionValidator = v.object({
  _id: v.id("pointTransactions"),
  _creationTime: v.number(),
  userId: v.id("users"),
  delta: v.number(),
  reason: v.union(v.literal("task"), v.literal("reward"), v.literal("manual")),
  refId: v.optional(v.string()),
  note: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  creatorName: v.optional(v.string()), // resolved for display
});

type Transaction = Infer<typeof transactionValidator>;

const balanceEntryValidator = v.object({
  userId: v.id("users"),
  slug: v.string(),
  name: v.string(),
  color: v.string(),
  emoji: v.string(),
  balance: v.number(),
});

// Resolve whose balance/history is queried (default: the caller). Kids may
// only query their own; parents may query anyone.
async function resolveTarget(
  db: DatabaseReader,
  caller: Doc<"users">,
  userId: Id<"users"> | undefined,
): Promise<Id<"users">> {
  const target = userId ?? caller._id;
  if (target !== caller._id && caller.role !== "parent") {
    throw new ConvexError("You cannot view another user's points");
  }
  const user = await db.get(target);
  if (user === null) {
    throw new ConvexError("User not found");
  }
  return target;
}

// Balance = sum of deltas over by_user. Data volume is tiny (family scale).
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

// Balance of one user (default: the caller). Kids see only their own.
export const getBalance = query({
  args: { token: v.string(), userId: v.optional(v.id("users")) },
  returns: v.object({ balance: v.number(), available: v.number() }),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    const target = await resolveTarget(ctx.db, caller, args.userId);
    const balance = await sumBalance(ctx.db, target);
    // Requested (not yet approved) redemptions block their cost from `available`.
    const ownRedemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .collect();
    const blocked = ownRedemptions
      .filter((r) => r.status === "requested")
      .reduce((sum, r) => sum + r.costSnapshot, 0);
    return { balance, available: balance - blocked };
  },
});

// Transaction history of one user (default: the caller), newest first.
// Kids see only their own.
export const listHistory = query({
  args: { token: v.string(), userId: v.optional(v.id("users")) },
  returns: v.array(transactionValidator),
  handler: async (ctx, args) => {
    const caller = await requireUser(ctx, args.token);
    const target = await resolveTarget(ctx.db, caller, args.userId);
    const transactions = await ctx.db
      .query("pointTransactions")
      .withIndex("by_user", (q) => q.eq("userId", target))
      .collect();
    transactions.sort(
      (a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime,
    );
    const result: Transaction[] = [];
    for (const t of transactions) {
      const creator = await ctx.db.get(t.createdBy);
      result.push({ ...t, creatorName: creator?.name });
    }
    return result;
  },
});

// Balances of all children, by name (parent only).
export const listBalances = query({
  args: { token: v.string() },
  returns: v.array(balanceEntryValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    // The users table is fixed (4 family members), so a full collect plus
    // Array.filter is fine — no .filter() scan on a growing table.
    const users = await ctx.db.query("users").collect();
    const children = users.filter((u) => u.role === "child");
    children.sort((a, b) => a.name.localeCompare(b.name));
    const result: Infer<typeof balanceEntryValidator>[] = [];
    for (const child of children) {
      result.push({
        userId: child._id,
        slug: child.slug,
        name: child.name,
        color: child.color,
        emoji: child.emoji,
        balance: await sumBalance(ctx.db, child._id),
      });
    }
    return result;
  },
});

// Manual bonus/penalty for a child (parent only).
export const adjust = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    delta: v.number(),
    note: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const target = await ctx.db.get(args.userId);
    if (target === null) {
      throw new ConvexError("User not found");
    }
    if (target.role !== "child") {
      throw new ConvexError("Manual adjustments require a child user");
    }
    if (
      !Number.isInteger(args.delta) ||
      args.delta === 0 ||
      args.delta < -MAX_ADJUST_ABS ||
      args.delta > MAX_ADJUST_ABS
    ) {
      throw new ConvexError(
        `Delta must be a non-zero integer between -${String(MAX_ADJUST_ABS)} and ${String(MAX_ADJUST_ABS)}`,
      );
    }
    const note = args.note.trim();
    if (note.length < 1 || note.length > MAX_ADJUST_NOTE_LENGTH) {
      throw new ConvexError(
        `Note must be 1..${String(MAX_ADJUST_NOTE_LENGTH)} characters`,
      );
    }
    await ctx.db.insert("pointTransactions", {
      userId: target._id,
      delta: args.delta,
      reason: "manual",
      note,
      createdBy: caller._id,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});
