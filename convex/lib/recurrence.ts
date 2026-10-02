// Recurrence validator shared by the task schema and (Task 2) backend logic.
// The pure matching engine lives here too (see below); it never touches `db`.

import { v, type Infer } from "convex/values";

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
