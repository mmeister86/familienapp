import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireParent, toPublicUser } from "./lib/auth";

// Public user shape (same projection as `auth.me` — no PIN or lockout fields).
// Copied here by value so this module does not import from auth.ts.
const publicUserValidator = v.object({
  _id: v.id("users"),
  slug: v.string(),
  name: v.string(),
  role: v.union(v.literal("parent"), v.literal("child")),
  color: v.string(),
  emoji: v.string(),
});

// User directory for the parent-only task editor assignee picker.
// Parent only: kids never need the full directory (visibility is enforced
// server-side in the task queries).
export const list = query({
  args: { token: v.string() },
  returns: v.array(publicUserValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const users = await ctx.db.query("users").collect();
    return users.map(toPublicUser);
  },
});
