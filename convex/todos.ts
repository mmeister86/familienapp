import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  addDays,
  compareDates,
  toBerlinDateString,
  todayBerlin,
} from "./lib/dates";
import { toWireTask, MAX_DAYS, type WirePerson, type WireTask } from "./lib/todos";

// Wire contract for GET /todos — the binding spec is .docs/FAMILY_APP.md.
// Optional fields are omitted, never null.
export const wireTaskValidator = v.object({
  id: v.string(), // task instance id, not the task definition id
  title: v.string(),
  assignee: v.optional(v.string()), // user slug; omitted = whole family
  date: v.optional(v.string()), // omitted = undated ("anytime")
  status: v.union(
    v.literal("open"),
    v.literal("pending"),
    v.literal("done"),
    v.literal("missed"),
  ),
  points: v.optional(v.number()), // omitted when 0/undefined
  recurring: v.optional(v.boolean()), // omitted when false
});

export const wirePersonValidator = v.object({
  slug: v.string(),
  name: v.string(),
  role: v.union(v.literal("parent"), v.literal("child")),
  color: v.string(),
  points: v.number(),
});

// Balance = sum of deltas over by_user (same as points.ts; family scale).
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

// Read-only feed of the wall dashboard. Internal: only the GET /todos HTTP
// action should reach it (it carries no user session token).
export const getTodos = internalQuery({
  args: { days: v.number() },
  returns: v.object({
    date: v.string(), // today, Europe/Berlin
    people: v.array(wirePersonValidator),
    tasks: v.array(wireTaskValidator),
  }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.days) || args.days < 1 || args.days > MAX_DAYS) {
      throw new ConvexError("days must be an integer between 1 and 7");
    }

    const today = todayBerlin();
    const selected = new Map<string, Doc<"taskInstances">>();

    // 1. Every instance dated within [today, today+days-1], all statuses.
    for (let offset = 0; offset < args.days; offset++) {
      const date = addDays(today, offset);
      const dated = await ctx.db
        .query("taskInstances")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      for (const instance of dated) {
        selected.set(instance._id, instance);
      }
    }

    // Open + pending instances serve both overdue (2) and undated (4).
    const openCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const pendingCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const activeCandidates = [...openCandidates, ...pendingCandidates];

    // 2. Overdue open/pending instances whose task is a one-off or
    // afterCompletion (same rule as listToday's overdue).
    for (const instance of activeCandidates) {
      if (
        instance.date === undefined ||
        compareDates(instance.date, today) >= 0
      ) {
        continue;
      }
      const task = await ctx.db.get(instance.taskId);
      if (
        task === null ||
        (task.recurrence.kind !== "none" &&
          task.recurrence.kind !== "afterCompletion")
      ) {
        continue;
      }
      selected.set(instance._id, instance);
    }

    // 3. Instances completed today (Berlin day), any date (listToday rule).
    const doneCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .collect();
    for (const instance of doneCandidates) {
      if (
        instance.completedAt !== undefined &&
        toBerlinDateString(instance.completedAt) === today
      ) {
        selected.set(instance._id, instance);
      }
    }

    // 4. Undated open/pending instances ("anytime").
    for (const instance of activeCandidates) {
      if (instance.date === undefined) {
        selected.set(instance._id, instance);
      }
    }

    // Resolve task + assignee, skip orphans (deleted task) and empty titles.
    const tasks: WireTask[] = [];
    for (const instance of selected.values()) {
      const task = await ctx.db.get(instance.taskId);
      if (task === null) {
        continue;
      }
      let assigneeSlug: string | undefined;
      if (instance.assigneeId !== undefined) {
        const assignee = await ctx.db.get(instance.assigneeId);
        if (assignee !== null) {
          assigneeSlug = assignee.slug;
        }
      }
      const wire = toWireTask({
        id: instance._id,
        title: task.title,
        status: instance.status,
        assigneeSlug,
        date: instance.date,
        pointsSnapshot: instance.pointsSnapshot,
        recurrenceKind: task.recurrence.kind,
      });
      if (wire !== null) {
        tasks.push(wire);
      }
    }

    // Dated first by date ascending then title (de); undated last by title.
    tasks.sort((a, b) => {
      if (a.date !== undefined && b.date !== undefined) {
        return (
          compareDates(a.date, b.date) || a.title.localeCompare(b.title, "de")
        );
      }
      if (a.date !== undefined) {
        return -1;
      }
      if (b.date !== undefined) {
        return 1;
      }
      return a.title.localeCompare(b.title, "de");
    });

    // All four users (parents included) with their balance, by name (de).
    const users = await ctx.db.query("users").collect();
    users.sort((a, b) => a.name.localeCompare(b.name, "de"));
    const people: WirePerson[] = [];
    for (const user of users) {
      people.push({
        slug: user.slug,
        name: user.name,
        role: user.role,
        color: user.color,
        points: await sumBalance(ctx.db, user._id),
      });
    }

    return { date: today, people, tasks };
  },
});
