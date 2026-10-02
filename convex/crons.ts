import { v } from "convex/values";
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { datesNeedingInstances } from "./lib/recurrence";
import { addDays, compareDates, todayBerlin } from "./lib/dates";

// Hourly maintenance (idempotent): seed missing instances for the rolling
// window (today..today+7, covering Upcoming's tomorrow..today+7)
// and mark past calendar-recurring opens as missed.
export const tick = internalMutation({
  args: {},
  returns: v.object({ ensured: v.number(), missed: v.number() }),
  handler: async (ctx) => {
    const today = todayBerlin();
    // Generation window covers Upcoming's tomorrow..today+7.
    const windowEnd = addDays(today, 7);
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

    // markMissed: past dated opens of calendar-recurring tasks only.
    // One-off and afterCompletion instances never become missed; afterCompletion
    // instances survive until completed, whenever that is.
    const opens = await ctx.db
      .query("taskInstances")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    const pastDated = opens.filter(
      (i) => i.date !== undefined && compareDates(i.date, today) < 0,
    );
    for (const instance of pastDated) {
      const task = await ctx.db.get(instance.taskId);
      if (
        task === null ||
        task.recurrence.kind === "none" ||
        task.recurrence.kind === "afterCompletion"
      ) {
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
crons.interval(
  "daily briefing cleanup",
  { hours: 24 },
  internal.ingest.cleanupBriefings,
);
export default crons;
