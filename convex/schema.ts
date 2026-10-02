import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    slug: v.string(),
    name: v.string(),
    role: v.union(v.literal("parent"), v.literal("child")),
    color: v.string(),
    emoji: v.string(),
    pinHash: v.string(),
    pinSalt: v.string(),
    failedAttempts: v.number(),
    lockedUntil: v.optional(v.number()),
  }).index("by_slug", ["slug"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),
});
