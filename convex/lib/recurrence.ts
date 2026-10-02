// Recurrence validator shared by the task schema and (Task 2) backend logic.
// The pure matching engine lives here too (see below); it never touches `db`.

import { v, type Infer } from "convex/values";
import { addDays, compareDates, daysInMonth, isoWeekday } from "./dates";

export const recurrenceValidator = v.union(
  v.object({ kind: v.literal("none"), dueDate: v.optional(v.string()) }),
  v.object({ kind: v.literal("daily") }),
  v.object({ kind: v.literal("weekly"), days: v.array(v.number()) }),
  v.object({ kind: v.literal("monthly"), dayOfMonth: v.number() }),
  v.object({
    kind: v.literal("afterCompletion"),
    everyNDays: v.number(),
  }),
);

export type Recurrence = Infer<typeof recurrenceValidator>;

// Does the recurrence produce an occurrence on `date`?
// - "none" -> false (one-offs are created once, never generated)
// - "daily" -> date >= startDate
// - "weekly" -> date >= startDate && isoWeekday(date) is in days
// - "monthly" -> date >= startDate && date is the clamped occurrence day:
//   occurrence day = min(dayOfMonth, daysInMonth(y, m))
// - "afterCompletion" -> false (created on completion, never by date scan)
export function matchesRecurrence(
  r: Recurrence,
  startDate: string,
  date: string,
): boolean {
  if (r.kind === "none" || r.kind === "afterCompletion") {
    return false;
  }
  if (compareDates(date, startDate) < 0) {
    return false;
  }
  if (r.kind === "daily") {
    return true;
  }
  if (r.kind === "weekly") {
    return r.days.includes(isoWeekday(date));
  }
  // Monthly: clamp the target day to the end of short months, so e.g.
  // dayOfMonth 31 still occurs in February (on the 28th/29th).
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return day === Math.min(r.dayOfMonth, daysInMonth(year, month));
}

// Every date in [fromInclusive, toInclusive] that needs an instance:
// within [startDate, endDate] and matching the recurrence.
// Sorted ascending, deduped. "none"/"afterCompletion" -> [].
export function datesNeedingInstances(
  r: Recurrence,
  startDate: string,
  endDate: string | undefined,
  fromInclusive: string,
  toInclusive: string,
): string[] {
  if (r.kind === "none" || r.kind === "afterCompletion") {
    return [];
  }
  const from =
    compareDates(fromInclusive, startDate) < 0 ? startDate : fromInclusive;
  const to =
    endDate !== undefined && compareDates(endDate, toInclusive) < 0
      ? endDate
      : toInclusive;
  const dates: string[] = [];
  let current = from;
  while (compareDates(current, to) <= 0) {
    if (matchesRecurrence(r, startDate, current)) {
      dates.push(current);
    }
    current = addDays(current, 1);
  }
  return dates;
}
