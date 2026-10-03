// Convex validators mirroring convex/lib/calendarTypes.ts. These are the
// wire-level contract for calendar functions; keep them in sync with the
// TypeScript types by hand (validators cannot be derived from plain types).

import { v } from "convex/values";

export const calendarSourceKindValidator = v.union(
  v.literal("ics"),
  v.literal("google"),
);

export const calendarSourceModeValidator = v.union(
  v.literal("shadow"),
  v.literal("active"),
);

export const calendarWindowValidator = v.object({
  startDate: v.string(),
  endDate: v.string(),
});

export const normalizedCalendarEventValidator = v.object({
  uid: v.string(),
  recurrenceId: v.optional(v.string()),
  title: v.string(),
  start: v.string(),
  end: v.optional(v.string()),
  allDay: v.boolean(),
  calendar: v.optional(v.string()),
  location: v.optional(v.string()),
});

export const calendarFeedV1Validator = v.object({
  version: v.literal(1),
  window: calendarWindowValidator,
  generatedAt: v.number(),
  events: v.array(normalizedCalendarEventValidator),
});

export const calendarSourceInputValidator = v.object({
  sourceKey: v.string(),
  name: v.string(),
  kind: calendarSourceKindValidator,
  url: v.optional(v.string()),
  color: v.optional(v.string()),
  intervalMs: v.optional(v.number()),
  sortOrder: v.optional(v.number()),
});

// Person/source binding kinds: calendar, school (beste.schule) and meal
// (VielfaltMenü) accounts bound to internal users. Extend explicitly.
export const personSourceBindingKindValidator = v.union(
  v.literal("calendar"),
  v.literal("school"),
  v.literal("meal"),
);

// Public source shape returned by calendarSources.list. The table holds no
// secrets by design (credentials stay in server-side configuration), so the
// stored document is safe to return as-is.
export const calendarSourcePublicValidator = v.object({
  _id: v.id("calendarSources"),
  _creationTime: v.number(),
  sourceKey: v.string(),
  name: v.string(),
  kind: calendarSourceKindValidator,
  url: v.optional(v.string()),
  color: v.optional(v.string()),
  enabled: v.boolean(),
  mode: calendarSourceModeValidator,
  sortOrder: v.number(),
  intervalMs: v.number(),
  configurationRevision: v.number(),
  lastAttemptAt: v.optional(v.number()),
  lastSuccessAt: v.optional(v.number()),
  lastResult: v.optional(
    v.union(v.literal("success"), v.literal("partial"), v.literal("error")),
  ),
  lastError: v.optional(v.string()),
});
