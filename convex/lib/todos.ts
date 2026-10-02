// Pure wire mapping and selection predicates for GET /todos (the wall
// dashboard) and the app's Today view. Kept free of Convex imports so it is
// unit-testable; the binding contract lives in .docs/FAMILY_APP.md › GET /todos.

import { addDays, compareDates, toBerlinDateString } from "./dates";

export type TaskStatus = "open" | "pending" | "done" | "missed";

export type RecurrenceKind =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "afterCompletion";

// One task instance on the wire. Optional fields are omitted, never null:
// `assignee` (undefined = whole family), `date` (undefined = anytime),
// `points` (0/undefined = no points) and `recurring` (false = one-off).
export type WireTask = {
  id: string;
  title: string;
  assignee?: string;
  date?: string;
  status: TaskStatus;
  points?: number;
  recurring?: boolean;
};

export type WirePerson = {
  slug: string;
  name: string;
  role: "parent" | "child";
  color: string;
  points: number;
};

export type WireTaskInput = {
  id: string;
  title: string;
  status: TaskStatus;
  assigneeSlug?: string;
  date?: string;
  pointsSnapshot?: number;
  recurrenceKind: RecurrenceKind;
};

// Default window length when `days` is absent; the wall asks for 2.
export const DEFAULT_DAYS = 1;
export const MAX_DAYS = 7;

// Parse the `days` query parameter strictly: absent -> default, anything that
// is not exactly one digit 1..7 (no trimming, no Number() coercion) -> null.
export function parseDaysParam(params: URLSearchParams): number | null {
  const raw = params.get("days");
  if (raw === null) {
    return DEFAULT_DAYS;
  }
  if (!/^[1-7]$/.test(raw)) {
    return null;
  }
  return Number(raw);
}

// Map a task instance (+ its task definition) to the wire shape. Returns null
// for empty/whitespace-only titles, which the caller skips.
export function toWireTask(input: WireTaskInput): WireTask | null {
  const title = input.title.trim();
  if (title.length === 0) {
    return null;
  }
  const task: WireTask = {
    id: input.id,
    title,
    status: input.status,
  };
  if (input.assigneeSlug !== undefined) {
    task.assignee = input.assigneeSlug;
  }
  if (input.date !== undefined) {
    task.date = input.date;
  }
  if (input.pointsSnapshot !== undefined && input.pointsSnapshot !== 0) {
    task.points = input.pointsSnapshot;
  }
  if (input.recurrenceKind !== "none") {
    task.recurring = true;
  }
  return task;
}

// The Berlin days a window covers: [today, today+days-1]. `days` is the
// validated 1..7 parameter, so today is always included and today+days is not.
export function windowDates(today: string, days: number): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset++) {
    dates.push(addDays(today, offset));
  }
  return dates;
}

// Shared Today-view rules. Both `listToday` and `GET /todos` use these so the
// two views cannot drift apart. Plain fields only; no Convex docs.

// Overdue: an open/pending instance dated before today whose task is a one-off
// ("none") or "afterCompletion". Daily/weekly/monthly instances roll forward
// instead of becoming overdue. `afterCompletion` instances never miss, so
// past-due ones stay here until completed.
export function isOverdueForToday(
  input: {
    date?: string;
    status: TaskStatus;
    recurrenceKind: RecurrenceKind;
  },
  today: string,
): boolean {
  if (input.date === undefined || compareDates(input.date, today) >= 0) {
    return false;
  }
  if (input.status !== "open" && input.status !== "pending") {
    return false;
  }
  return (
    input.recurrenceKind === "none" ||
    input.recurrenceKind === "afterCompletion"
  );
}

// Done today: a "done" instance completed during the given Berlin day,
// regardless of the date it was scheduled for.
export function isDoneToday(
  input: { status: TaskStatus; completedAt?: number },
  today: string,
): boolean {
  return (
    input.status === "done" &&
    input.completedAt !== undefined &&
    toBerlinDateString(input.completedAt) === today
  );
}

// Undated open/pending instances ("anytime").
export function isUndatedActive(input: {
  date?: string;
  status: TaskStatus;
}): boolean {
  return (
    input.date === undefined &&
    (input.status === "open" || input.status === "pending")
  );
}
