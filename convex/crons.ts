import { v } from "convex/values";
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { datesNeedingInstances } from "./lib/recurrence";
import { addDays, compareDates, todayBerlin } from "./lib/dates";

// Hourly maintenance (idempotent): seed missing instances for the rolling
// 7-day window (today..today+6) and mark past recurring opens as missed.
export const tick = internalMutation({
  args: {},
  returns: v.object({ ensured: v.number(), missed: v.number() }),
  handler: async (ctx) => {
    const today = todayBerlin();
    const windowEnd = addDays(today, 6);
    let ensured = 0;
    let missed = 0;

    // ensureInstances: daily/weekly/monthly only; none/afterCompletion skipped.
    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    for (const task of activeTasks) {
      const kind = task.recurrence.kind;
      if (kind !== "daily" && kind !== "weekly" && kind !== "monthly") {
        continue;
      }
      const dates = datesNeedingInstances(
        task.recurrence,
        task.startDate,
        task.endDate,
        today,
        windowEnd,
      );
      for (const date of dates) {
        const existing = await ctx.db
          .query("taskInstances")
          .withIndex("by_task_date", (q) =>
            q.eq("taskId", task._id).eq("date", date),
          )
          .first();
        if (existing !== null) {
          continue;
        }
        await ctx.db.insert("taskInstances", {
          taskId: task._id,
          assigneeId: task.assigneeId,
          date,
          status: "open",
          pointsSnapshot: task.points,
        });
        ensured += 1;
      }
    }

    // markMissed: past dated opens of recurring tasks only.
    // One-off instances NEVER become missed.
    const opens = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const pastDated = opens.filter(
      (i) => i.date !== undefined && compareDates(i.date, today) < 0,
    );
    for (const instance of pastDated) {
      const task = await ctx.db.get(instance.taskId);
      if (task === null || task.recurrence.kind === "none") {
        continue;
      }
      await ctx.db.patch(instance._id, { status: "missed" });
      missed += 1;
    }

    return { ensured, missed };
  },
});

const crons = cronJobs();
crons.interval("hourly task maintenance", { hours: 1 }, internal.crons.tick);
export default crons;
