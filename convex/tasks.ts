import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireParent } from "./lib/auth";
import {
  datesNeedingInstances,
  recurrenceValidator,
  type Recurrence,
} from "./lib/recurrence";
import {
  addDays,
  compareDates,
  isValidDateString,
  todayBerlin,
} from "./lib/dates";

const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;

// Task document plus the resolved assignee projection for the admin UI.
// Only public profile fields (slug/name/color/emoji) — never PIN fields.
const taskWithAssigneeValidator = v.object({
  _id: v.id("tasks"),
  _creationTime: v.number(),
  title: v.string(),
  notes: v.optional(v.string()),
  assigneeId: v.optional(v.id("users")),
  points: v.optional(v.number()),
  recurrence: recurrenceValidator,
  startDate: v.string(),
  endDate: v.optional(v.string()),
  active: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  assigneeSlug: v.optional(v.string()),
  assigneeName: v.optional(v.string()),
  assigneeColor: v.optional(v.string()),
  assigneeEmoji: v.optional(v.string()),
});

type TaskWithAssignee = {
  _id: Id<"tasks">;
  _creationTime: number;
  title: string;
  notes?: string;
  assigneeId?: Id<"users">;
  points?: number;
  recurrence: Recurrence;
  startDate: string;
  endDate?: string;
  active: boolean;
  createdBy: Id<"users">;
  createdAt: number;
  assigneeSlug?: string;
  assigneeName?: string;
  assigneeColor?: string;
  assigneeEmoji?: string;
};

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

function validateNotes(notes: string | undefined): void {
  if (notes !== undefined && notes.length > MAX_NOTES_LENGTH) {
    throw new ConvexError(
      `Notes must be at most ${String(MAX_NOTES_LENGTH)} characters`,
    );
  }
}

function validateDateRange(
  startDate: string,
  endDate: string | undefined,
): void {
  if (!isValidDateString(startDate)) {
    throw new ConvexError("Invalid startDate, expected YYYY-MM-DD");
  }
  if (endDate !== undefined) {
    if (!isValidDateString(endDate)) {
      throw new ConvexError("Invalid endDate, expected YYYY-MM-DD");
    }
    if (compareDates(endDate, startDate) < 0) {
      throw new ConvexError("endDate must not be before startDate");
    }
  }
}

// Validate recurrence semantics and return the normalized copy
// (weekly days deduped and sorted ascending).
function normalizeRecurrence(r: Recurrence): Recurrence {
  switch (r.kind) {
    case "none":
      if (r.dueDate !== undefined && !isValidDateString(r.dueDate)) {
        throw new ConvexError("Invalid dueDate, expected YYYY-MM-DD");
      }
      return r;
    case "daily":
      return r;
    case "weekly": {
      if (r.days.length === 0) {
        throw new ConvexError("Weekly recurrence needs at least one day");
      }
      for (const day of r.days) {
        if (!Number.isInteger(day) || day < 1 || day > 7) {
          throw new ConvexError(
            "Weekly days must be integers 1 (Monday) to 7 (Sunday)",
          );
        }
      }
      return { kind: "weekly", days: [...new Set(r.days)].sort((a, b) => a - b) };
    }
    case "monthly":
      if (!Number.isInteger(r.dayOfMonth) || r.dayOfMonth < 1 || r.dayOfMonth > 31) {
        throw new ConvexError("Monthly dayOfMonth must be an integer 1..31");
      }
      return r;
    case "afterCompletion":
      if (!Number.isInteger(r.everyNDays) || r.everyNDays < 1) {
        throw new ConvexError(
          "afterCompletion everyNDays must be an integer >= 1",
        );
      }
      return r;
  }
}

// Semantic equality for normalized recurrences (key order independent).
function recurrencesEqual(a: Recurrence, b: Recurrence): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case "none":
      return b.kind === "none" && a.dueDate === b.dueDate;
    case "daily":
      return true;
    case "weekly":
      return (
        b.kind === "weekly" &&
        a.days.length === b.days.length &&
        a.days.every((day, i) => day === b.days[i])
      );
    case "monthly":
      return b.kind === "monthly" && a.dayOfMonth === b.dayOfMonth;
    case "afterCompletion":
      return b.kind === "afterCompletion" && a.everyNDays === b.everyNDays;
  }
}

// Assignee/points rules: the assignee must exist; points (integer >= 0)
// require a child assignee; family tasks carry no points.
async function validateAssigneeAndPoints(
  db: DatabaseReader,
  assigneeId: Id<"users"> | undefined,
  points: number | undefined,
): Promise<void> {
  if (points !== undefined) {
    if (!Number.isInteger(points) || points < 0) {
      throw new ConvexError("Points must be an integer >= 0");
    }
    if (assigneeId === undefined) {
      throw new ConvexError("Family tasks cannot carry points");
    }
  }
  if (assigneeId !== undefined) {
    const assignee = await db.get(assigneeId);
    if (assignee === null) {
      throw new ConvexError("Assignee not found");
    }
    if (points !== undefined && assignee.role !== "child") {
      throw new ConvexError("Points require an assignee who is a child");
    }
  }
}

// Attach the public assignee projection to a task document.
async function withAssignee(
  db: DatabaseReader,
  task: Doc<"tasks">,
): Promise<TaskWithAssignee> {
  if (task.assigneeId === undefined) {
    return { ...task };
  }
  const assignee = await db.get(task.assigneeId);
  if (assignee === null) {
    return { ...task };
  }
  return {
    ...task,
    assigneeSlug: assignee.slug,
    assigneeName: assignee.name,
    assigneeColor: assignee.color,
    assigneeEmoji: assignee.emoji,
  };
}

// Does an instance already exist for (taskId, date)? Used for idempotent seeding.
async function instanceExistsForDate(
  db: DatabaseReader,
  taskId: Id<"tasks">,
  date: string,
): Promise<boolean> {
  const existing = await db
    .query("taskInstances")
    .withIndex("by_task_date", (q) => q.eq("taskId", taskId).eq("date", date))
    .first();
  return existing !== null;
}

// Create a task (parent only) and seed its initial open instances.
export const create = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    notes: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    points: v.optional(v.number()),
    recurrence: recurrenceValidator,
    startDate: v.string(),
    endDate: v.optional(v.string()),
  },
  returns: v.object({ taskId: v.id("tasks") }),
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const title = normalizeTitle(args.title);
    validateNotes(args.notes);
    validateDateRange(args.startDate, args.endDate);
    const recurrence = normalizeRecurrence(args.recurrence);
    await validateAssigneeAndPoints(ctx.db, args.assigneeId, args.points);

    const now = Date.now();
    const taskId = await ctx.db.insert("tasks", {
      title,
      notes: args.notes,
      assigneeId: args.assigneeId,
      points: args.points,
      recurrence,
      startDate: args.startDate,
      endDate: args.endDate,
      active: true,
      createdBy: caller._id,
      createdAt: now,
    });

    const today = todayBerlin(now);
    if (recurrence.kind === "none") {
      await ctx.db.insert("taskInstances", {
        taskId,
        assigneeId: args.assigneeId,
        date: recurrence.dueDate,
        status: "open",
        pointsSnapshot: args.points,
      });
    } else if (recurrence.kind === "afterCompletion") {
      await ctx.db.insert("taskInstances", {
        taskId,
        assigneeId: args.assigneeId,
        date: args.startDate,
        status: "open",
        pointsSnapshot: args.points,
      });
    } else {
      const dates = datesNeedingInstances(
        recurrence,
        args.startDate,
        args.endDate,
        today,
        addDays(today, 6),
      );
      for (const date of dates) {
        if (await instanceExistsForDate(ctx.db, taskId, date)) {
          continue;
        }
        await ctx.db.insert("taskInstances", {
          taskId,
          assigneeId: args.assigneeId,
          date,
          status: "open",
          pointsSnapshot: args.points,
        });
      }
    }
    return { taskId };
  },
});

// Update a task (parent only). Pass null to clear notes/assigneeId/points/endDate.
// Changing recurrence/startDate/endDate/assigneeId/active regenerates future
// open instances; past instances keep their snapshots (audit trail).
export const update = mutation({
  args: {
    token: v.string(),
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
    assigneeId: v.optional(v.union(v.id("users"), v.null())),
    points: v.optional(v.union(v.number(), v.null())),
    recurrence: v.optional(recurrenceValidator),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.union(v.string(), v.null())),
    active: v.optional(v.boolean()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const task = await ctx.db.get(args.taskId);
    if (task === null) {
      throw new ConvexError("Task not found");
    }

    const newTitle =
      args.title !== undefined ? normalizeTitle(args.title) : task.title;
    const newNotes =
      args.notes === undefined
        ? task.notes
        : args.notes === null
          ? undefined
          : args.notes;
    validateNotes(newNotes);
    const newAssigneeId =
      args.assigneeId === undefined
        ? task.assigneeId
        : args.assigneeId === null
          ? undefined
          : args.assigneeId;
    const newPoints =
      args.points === undefined
        ? task.points
        : args.points === null
          ? undefined
          : args.points;
    const newRecurrence =
      args.recurrence !== undefined
        ? normalizeRecurrence(args.recurrence)
        : task.recurrence;
    const newStartDate = args.startDate ?? task.startDate;
    const newEndDate =
      args.endDate === undefined
        ? task.endDate
        : args.endDate === null
          ? undefined
          : args.endDate;
    const newActive = args.active ?? task.active;

    validateDateRange(newStartDate, newEndDate);
    await validateAssigneeAndPoints(ctx.db, newAssigneeId, newPoints);

    const needsRegen =
      !recurrencesEqual(newRecurrence, task.recurrence) ||
      newStartDate !== task.startDate ||
      newEndDate !== task.endDate ||
      newAssigneeId !== task.assigneeId ||
      newActive !== task.active;

    await ctx.db.patch(task._id, {
      title: newTitle,
      notes: newNotes,
      assigneeId: newAssigneeId,
      points: newPoints,
      recurrence: newRecurrence,
      startDate: newStartDate,
      endDate: newEndDate,
      active: newActive,
    });

    if (!needsRegen) {
      return { ok: true };
    }

    // Delete future + undated open instances; past opens stay untouched.
    const today = todayBerlin();
    const instances = await ctx.db
      .query("taskInstances")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    const futureOpens = instances.filter(
      (i) =>
        i.status === "open" &&
        (i.date === undefined || compareDates(i.date, today) >= 0),
    );
    for (const instance of futureOpens) {
      await ctx.db.delete(instance._id);
    }
    if (!newActive) {
      return { ok: true };
    }

    const remainingOpens = instances.filter(
      (i) =>
        i.status === "open" &&
        i.date !== undefined &&
        compareDates(i.date, today) < 0,
    );
    if (newRecurrence.kind === "none") {
      if (remainingOpens.length === 0) {
        await ctx.db.insert("taskInstances", {
          taskId: task._id,
          assigneeId: newAssigneeId,
          date: newRecurrence.dueDate,
          status: "open",
          pointsSnapshot: newPoints,
        });
      }
    } else if (newRecurrence.kind === "afterCompletion") {
      if (remainingOpens.length === 0) {
        const nextDate =
          compareDates(newStartDate, today) > 0 ? newStartDate : today;
        await ctx.db.insert("taskInstances", {
          taskId: task._id,
          assigneeId: newAssigneeId,
          date: nextDate,
          status: "open",
          pointsSnapshot: newPoints,
        });
      }
    } else {
      const dates = datesNeedingInstances(
        newRecurrence,
        newStartDate,
        newEndDate,
        today,
        addDays(today, 6),
      );
      for (const date of dates) {
        if (await instanceExistsForDate(ctx.db, task._id, date)) {
          continue;
        }
        await ctx.db.insert("taskInstances", {
          taskId: task._id,
          assigneeId: newAssigneeId,
          date,
          status: "open",
          pointsSnapshot: newPoints,
        });
      }
    }
    return { ok: true };
  },
});

// Hard delete a task and ALL its instances (parent only).
export const remove = mutation({
  args: { token: v.string(), taskId: v.id("tasks") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const task = await ctx.db.get(args.taskId);
    if (task === null) {
      throw new ConvexError("Task not found");
    }
    const instances = await ctx.db
      .query("taskInstances")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    for (const instance of instances) {
      await ctx.db.delete(instance._id);
    }
    await ctx.db.delete(task._id);
    return { ok: true };
  },
});


// All tasks with the assignee projection, newest first (parent only).
export const list = query({
  args: { token: v.string() },
  returns: v.array(taskWithAssigneeValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const inactiveTasks = await ctx.db
      .query("tasks")
      .withIndex("by_active", (q) => q.eq("active", false))
      .collect();
    const tasks = [...activeTasks, ...inactiveTasks].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const result: TaskWithAssignee[] = [];
    for (const task of tasks) {
      result.push(await withAssignee(ctx.db, task));
    }
    return result;
  },
});

// One task with the assignee projection, or null (parent only).
export const get = query({
  args: { token: v.string(), taskId: v.id("tasks") },
  returns: v.union(taskWithAssigneeValidator, v.null()),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const task = await ctx.db.get(args.taskId);
    if (task === null) {
      return null;
    }
    return await withAssignee(ctx.db, task);
  },
});
