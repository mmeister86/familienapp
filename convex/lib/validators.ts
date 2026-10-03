import { v, type Infer } from "convex/values";

// Wire contract for POST /ingest/* — the binding spec is .docs/FAMILY_APP.md.
// Optional fields are omitted, never null. These validators are shared by the
// schema, the ingest mutations and the overview queries.

export const lessonChangeValidator = v.object({
  type: v.union(
    v.literal("cancelled"),
    v.literal("substitution"),
    v.literal("roomChange"),
    v.literal("other"),
  ),
  note: v.optional(v.string()),
});

export const lessonValidator = v.object({
  period: v.number(), // 0 = outside the numbered lessons (afternoon club)
  start: v.optional(v.string()), // "07:30"
  end: v.optional(v.string()),
  subject: v.string(),
  room: v.optional(v.string()),
  teacher: v.optional(v.string()),
  tag: v.optional(v.string()), // e.g. "GTA"
  change: v.optional(lessonChangeValidator),
});

export const eventValidator = v.object({
  title: v.string(),
  start: v.string(), // RFC 3339, or YYYY-MM-DD when allDay
  end: v.optional(v.string()), // RFC 3339, or exclusive YYYY-MM-DD when allDay
  allDay: v.boolean(),
  calendar: v.optional(v.string()),
  location: v.optional(v.string()),
});

export const mealValidator = v.object({
  // only on delivery days
  ordered: v.boolean(), // false = nothing ordered
  title: v.optional(v.string()),
  description: v.optional(v.string()),
});

export const childDayValidator = v.object({
  date: v.string(),
  notices: v.optional(v.array(v.string())),
  timetable: v.array(lessonValidator), // [] on weekends/holidays
  events: v.array(eventValidator),
  meal: v.optional(mealValidator),
});

export const homeworkValidator = v.object({
  subject: v.string(),
  text: v.string(),
  dueDate: v.string(),
});

export const examValidator = v.object({
  subject: v.string(),
  date: v.string(),
  text: v.optional(v.string()),
});

// Fields are exported separately from the object validator so the same shape
// can be used for a mutation's `args` (which needs a property map).
export const childSnapshotFields = {
  childSlug: v.string(),
  days: v.array(childDayValidator), // today … today+6, always 7
  homework: v.array(homeworkValidator),
  exams: v.array(examValidator),
  sourceUpdatedAt: v.number(), // oldest fetch time of the sources behind it
};
export const childSnapshotValidator = v.object(childSnapshotFields);

export const briefingItemValidator = v.object({
  section: v.union(v.literal("tonight"), v.literal("day")),
  icon: v.string(),
  who: v.optional(v.string()),
  color: v.optional(v.string()),
  text: v.string(),
});

// One point of the parents' AI briefing (convex/parentBriefing.ts). `who` is
// a user slug or "familie".
export const parentBriefingItemValidator = v.object({
  who: v.string(),
  emoji: v.string(),
  text: v.string(),
});

export const briefingFields = {
  kind: v.union(v.literal("morning"), v.literal("evening")),
  date: v.string(), // the day it is about: today (morning) / tomorrow (evening)
  text: v.string(), // Markdown, ready to render
  headline: v.optional(v.string()),
  items: v.array(briefingItemValidator),
  ai: v.boolean(), // false = rule-based fallback
  generatedAt: v.number(),
};
export const briefingValidator = v.object(briefingFields);

export type ChildDay = Infer<typeof childDayValidator>;
export type Lesson = Infer<typeof lessonValidator>;
export type LessonChange = Infer<typeof lessonChangeValidator>;
export type SchoolEvent = Infer<typeof eventValidator>;
export type Meal = Infer<typeof mealValidator>;
export type Homework = Infer<typeof homeworkValidator>;
export type Exam = Infer<typeof examValidator>;
export type ChildSnapshot = Infer<typeof childSnapshotValidator>;
export type BriefingItem = Infer<typeof briefingItemValidator>;
export type Briefing = Infer<typeof briefingValidator>;
