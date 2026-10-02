import { v, type Infer } from "convex/values";
import { query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireParent, requireUser } from "./lib/auth";
import { addDays, compareDates, todayBerlin, toBerlinDateString } from "./lib/dates";

// Instance fields plus the resolved task title/notes, the public assignee
// projection (no PIN fields), and whether the task recurs.
const taskInstanceItemValidator = v.object({
  _id: v.id("taskInstances"),
  _creationTime: v.number(),
  taskId: v.id("tasks"),
  assigneeId: v.optional(v.id("users")),
  date: v.optional(v.string()),
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
  taskTitle: v.string(),
  taskNotes: v.optional(v.string()),
  assigneeSlug: v.optional(v.string()),
  assigneeName: v.optional(v.string()),
  assigneeColor: v.optional(v.string()),
  assigneeEmoji: v.optional(v.string()),
  recurring: v.boolean(),
});

type TaskInstanceItem = Infer<typeof taskInstanceItemValidator>;

const upcomingDayValidator = v.object({
  date: v.string(),
  items: v.array(taskInstanceItemValidator),
});

// Parents see everything; kids see only their own + family tasks.
function visibleTo(
  user: Doc<"users">,
  instance: Doc<"taskInstances">,
): boolean {
  return (
    user.role === "parent" ||
    instance.assigneeId === undefined ||
    instance.assigneeId === user._id
  );
}

// Resolve the task (N+1 is fine at family scale) and the public assignee
// projection. Returns null for orphaned instances (task deleted).
async function toItem(
  db: DatabaseReader,
  instance: Doc<"taskInstances">,
): Promise<TaskInstanceItem | null> {
  const task = await db.get(instance.taskId);
  if (task === null) {
    return null;
  }
  const item: TaskInstanceItem = {
    ...instance,
    taskTitle: task.title,
    taskNotes: task.notes,
    recurring: task.recurrence.kind !== "none",
  };
  if (instance.assigneeId !== undefined) {
    const assignee = await db.get(instance.assigneeId);
    if (assignee !== null) {
      item.assigneeSlug = assignee.slug;
      item.assigneeName = assignee.name;
      item.assigneeColor = assignee.color;
      item.assigneeEmoji = assignee.emoji;
    }
  }
  return item;
}

// Enrich + visibility-filter a batch of instances for one user.
async function toVisibleItems(
  db: DatabaseReader,
  user: Doc<"users">,
  instances: Doc<"taskInstances">[],
): Promise<TaskInstanceItem[]> {
  const items: TaskInstanceItem[] = [];
  for (const instance of instances) {
    if (!visibleTo(user, instance)) {
      continue;
    }
    const item = await toItem(db, instance);
    if (item !== null) {
      items.push(item);
    }
  }
  return items;
}

function byTaskTitleAsc(a: TaskInstanceItem, b: TaskInstanceItem): number {
  return a.taskTitle.localeCompare(b.taskTitle);
}

// Today's view: overdue one-offs plus today's opens and today's completions.
export const listToday = query({
  args: { token: v.string() },
  returns: v.object({
    overdue: v.array(taskInstanceItemValidator),
    today: v.array(taskInstanceItemValidator),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const today = todayBerlin();

    // Overdue: one-off (kind "none") and afterCompletion instances, dated in
    // the past, still open or pending approval. afterCompletion instances
    // never miss, so past-due ones appear as overdue until completed.
    const openCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const pendingCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const overdueDated = [...openCandidates, ...pendingCandidates].filter(
      (i) => i.date !== undefined && compareDates(i.date, today) < 0,
    );
    const overdueItems: TaskInstanceItem[] = [];
    for (const instance of overdueDated) {
      if (!visibleTo(user, instance)) {
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
      const item = await toItem(ctx.db, instance);
      if (item !== null) {
        overdueItems.push(item);
      }
    }
    overdueItems.sort((a, b) =>
      compareDates(a.date as string, b.date as string),
    );

    // Today: opens due today, then pending approvals, then everything
    // completed today (Berlin day).
    const datedToday = await ctx.db
      .query("taskInstances")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();
    const openToday = await toVisibleItems(
      ctx.db,
      user,
      datedToday.filter((i) => i.status === "open"),
    );
    openToday.sort(byTaskTitleAsc);

    const pendingToday = await toVisibleItems(
      ctx.db,
      user,
      datedToday.filter((i) => i.status === "pending"),
    );
    pendingToday.sort(byTaskTitleAsc);

    const doneCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .collect();
    const doneToday = await toVisibleItems(
      ctx.db,
      user,
      doneCandidates.filter(
        (i) =>
          i.completedAt !== undefined &&
          toBerlinDateString(i.completedAt) === today,
      ),
    );
    doneToday.sort(byTaskTitleAsc);

    return {
      overdue: overdueItems,
      today: [...openToday, ...pendingToday, ...doneToday],
    };
  },
});

// Undated open and pending instances ("anytime"), by task title.
export const listAnytime = query({
  args: { token: v.string() },
  returns: v.array(taskInstanceItemValidator),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const openCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const pendingCandidates = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const items = await toVisibleItems(
      ctx.db,
      user,
      [...openCandidates, ...pendingCandidates].filter(
        (i) => i.date === undefined,
      ),
    );
    items.sort(byTaskTitleAsc);
    return items;
  },
});

// The next 7 days (tomorrow..today+7), one entry per day including empties.
export const listUpcoming = query({
  args: { token: v.string() },
  returns: v.array(upcomingDayValidator),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const today = todayBerlin();
    const days: { date: string; items: TaskInstanceItem[] }[] = [];
    for (let offset = 1; offset <= 7; offset++) {
      const date = addDays(today, offset);
      const dated = await ctx.db
        .query("taskInstances")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      const items = await toVisibleItems(
        ctx.db,
        user,
        dated.filter((i) => i.status === "open" || i.status === "pending"),
      );
      items.sort(byTaskTitleAsc);
      days.push({ date, items });
    }
    return days;
  },
});

// All pending instances for the Approvals screen (parent only, any date incl.
// undated), oldest completion first. No visibility filter: parents see all.
export const listPending = query({
  args: { token: v.string() },
  returns: v.array(taskInstanceItemValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const pending = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const items: TaskInstanceItem[] = [];
    for (const instance of pending) {
      const item = await toItem(ctx.db, instance);
      if (item !== null) {
        items.push(item);
      }
    }
    items.sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
    return items;
  },
});
