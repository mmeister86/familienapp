import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { recurrenceValidator } from "./lib/recurrence";

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

  tasks: defineTable({
    title: v.string(),
    notes: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")), // undefined = whole family
    points: v.optional(v.number()), // only when assignee is a child (enforced in Task 2)
    recurrence: recurrenceValidator, // from convex/lib/recurrence.ts
    startDate: v.string(), // YYYY-MM-DD (Berlin)
    endDate: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_active", ["active"]),

  taskInstances: defineTable({
    taskId: v.id("tasks"),
    assigneeId: v.optional(v.id("users")),
    date: v.optional(v.string()), // undefined = undated one-off ("anytime")
    status: v.union(
      v.literal("open"),
      v.literal("pending"),
      v.literal("done"),
      v.literal("missed"),
    ),
    pointsSnapshot: v.optional(v.number()),
    completedBy: v.optional(v.id("users")),
    completedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    rejectNote: v.optional(v.string()),
  })
    .index("by_task", ["taskId"])
    .index("by_task_date", ["taskId", "date"])
    .index("by_assignee_date", ["assigneeId", "date"])
    .index("by_status", ["status"])
    .index("by_date", ["date"]),

  pointTransactions: defineTable({
    userId: v.id("users"),
    delta: v.number(), // + for tasks/bonus, − for rewards/penalty
    reason: v.union(
      v.literal("task"),
      v.literal("reward"),
      v.literal("manual"),
    ),
    refId: v.optional(v.string()), // instance id (reason "task"); redemption id later
    note: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
