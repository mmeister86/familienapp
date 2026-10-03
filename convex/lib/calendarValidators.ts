// Convex validators mirroring convex/lib/calendarTypes.ts. These are the
// wire-level contract for calendar functions; keep them in sync with the
// TypeScript types by hand (validators cannot be derived from plain types).

import { v } from "convex/values";

export const calendarSourceModeValidator = v.union(
  v.literal("shadow"),
  v.literal("convex"),
  v.literal("local"),
);

export const calendarSourcePanelValidator = v.union(
  v.literal("column"),
  v.literal("school"),
);

export const calendarImportStateValidator = v.union(
  v.literal("running"),
  v.literal("staging"),
  v.literal("ready"),
  v.literal("error"),
  v.literal("superseded"),
);

export const calendarWindowValidator = v.object({
  fromDate: v.string(),
  toDate: v.string(),
  fromMs: v.number(),
  toMs: v.number(),
});

export const calendarIdentityQualityValidator = v.union(
  v.literal("provider"),
  v.literal("fallback"),
);

export const normalizedCalendarEventValidator = v.object({
  key: v.string(),
  uid: v.string(),
  identityQuality: calendarIdentityQualityValidator,
  recurrenceId: v.optional(v.string()),
  title: v.string(),
  location: v.optional(v.string()),
  startMs: v.number(),
  endMs: v.number(),
  allDay: v.boolean(),
  timezone: v.string(),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
});

export const calendarFeedPersonValidator = v.object({
  id: v.string(),
  slug: v.string(),
  name: v.string(),
  role: v.union(v.literal("parent"), v.literal("child")),
});

export const calendarFeedBindingValidator = v.object({
  personId: v.string(),
  kind: v.union(v.literal("besteschule"), v.literal("timetable")),
  externalId: v.string(),
});

export const calendarFeedCalendarValidator = v.object({
  id: v.string(),
  sourceKey: v.string(),
  name: v.string(),
  color: v.string(),
  panel: calendarSourcePanelValidator,
  order: v.number(),
  intoCalendarId: v.optional(v.string()),
  personIds: v.array(v.string()),
  lastAttemptAt: v.optional(v.number()),
  lastSuccessAt: v.optional(v.number()),
  freshness: v.union(
    v.literal("neverLoaded"),
    v.literal("fresh"),
    v.literal("stale"),
    v.literal("disabled"),
  ),
  lastAttemptStatus: v.optional(
    v.union(v.literal("success"), v.literal("error")),
  ),
  error: v.optional(v.string()),
  coverage: v.optional(calendarWindowValidator),
});

export const calendarFeedEventValidator = v.object({
  key: v.string(),
  uid: v.string(),
  identityQuality: calendarIdentityQualityValidator,
  recurrenceId: v.optional(v.string()),
  title: v.string(),
  location: v.optional(v.string()),
  startMs: v.number(),
  endMs: v.number(),
  allDay: v.boolean(),
  timezone: v.string(),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  calendarId: v.string(),
});

export const calendarFeedV1Validator = v.object({
  version: v.literal(1),
  scope: v.literal("family-calendars"),
  timezone: v.literal("Europe/Berlin"),
  configurationRevision: v.number(),
  generatedAt: v.number(),
  window: calendarWindowValidator,
  people: v.array(calendarFeedPersonValidator),
  bindings: v.array(calendarFeedBindingValidator),
  calendars: v.array(calendarFeedCalendarValidator),
  events: v.array(calendarFeedEventValidator),
});

export const calendarSourceInputValidator = v.object({
  sourceKey: v.string(),
  name: v.string(),
  color: v.string(),
  panel: calendarSourcePanelValidator,
  order: v.number(),
  intoCalendarId: v.optional(v.id("calendarSources")),
  personIds: v.array(v.id("users")),
  urlEnvKey: v.string(),
  enabled: v.boolean(),
  intervalMs: v.number(),
});

// Person/source binding kinds: besteschule (school portal) and timetable
// (school timetable) accounts bound to internal users. Extend explicitly.
export const personSourceBindingKindValidator = v.union(
  v.literal("besteschule"),
  v.literal("timetable"),
);

// Public source shape returned by calendarSources.list. The table holds no
// secrets by design (feeds are referenced by urlEnvKey only; credentials
// stay in server-side configuration), so the stored document is safe to
// return as-is.
export const calendarSourcePublicValidator = v.object({
  _id: v.id("calendarSources"),
  _creationTime: v.number(),
  sourceKey: v.string(),
  name: v.string(),
  color: v.string(),
  panel: calendarSourcePanelValidator,
  order: v.number(),
  intoCalendarId: v.optional(v.id("calendarSources")),
  personIds: v.array(v.id("users")),
  urlEnvKey: v.string(),
  enabled: v.boolean(),
  mode: calendarSourceModeValidator,
  intervalMs: v.number(),
  configGeneration: v.number(),
  nextAttemptAt: v.optional(v.number()),
  runningImportId: v.optional(v.id("calendarImports")),
  leaseExpiresAt: v.optional(v.number()),
  publishedImportId: v.optional(v.id("calendarImports")),
  publishedDataImportId: v.optional(v.id("calendarImports")),
});
