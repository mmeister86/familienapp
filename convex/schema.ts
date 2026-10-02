import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { recurrenceValidator } from "./lib/recurrence";
import {
  briefingItemValidator,
  childDayValidator,
  examValidator,
  homeworkValidator,
} from "./lib/validators";

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
    refId: v.optional(v.string()), // instance id (reason "task"); redemption id
    note: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // Reward catalog (tiny table; full collect + sort by title, no index).
  rewards: defineTable({
    title: v.string(),
    emoji: v.optional(v.string()),
    cost: v.number(), // integer >= 1 (enforced in mutations)
    active: v.boolean(),
  }),

  redemptions: defineTable({
    rewardId: v.id("rewards"),
    userId: v.id("users"),
    costSnapshot: v.number(), // reward.cost at request time
    status: v.union(
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    requestedAt: v.number(),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Pushed by the wall dashboard (familydash), one doc per kid, replaced on
  // every push. Shape: .docs/FAMILY_APP.md › POST /ingest/child.
  childSnapshots: defineTable({
    childSlug: v.string(),
    days: v.array(childDayValidator), // today … today+6, always 7
    homework: v.array(homeworkValidator),
    exams: v.array(examValidator),
    sourceUpdatedAt: v.number(), // oldest fetch time of the sources behind it
    receivedAt: v.number(), // backend receive time
  }).index("by_childSlug", ["childSlug"]),

  // AI/rule-based briefings pushed by the dashboard; cleaned up after 14 days.
  // Shape: .docs/FAMILY_APP.md › POST /ingest/briefing.
  briefings: defineTable({
    kind: v.union(v.literal("morning"), v.literal("evening")),
    date: v.string(),
    text: v.string(),
    headline: v.optional(v.string()),
    items: v.array(briefingItemValidator),
    ai: v.boolean(),
    generatedAt: v.number(),
    receivedAt: v.number(),
  }).index("by_date_kind", ["date", "kind"]),
});
