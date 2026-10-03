// Protected calendar read projection (Task 4 of the calendar pilot).
//
// getDashboardFeed() is the internal source for GET /dashboard/calendars:
// every active mode=convex calendar with its last published stand.
// forUser() is the role-scoped variant for app sessions: children see only
// calendars explicitly assigned to them (via source personIds); parents
// keep the family stand except calendars explicitly assigned to a child.
//
// Both read only published data imports overlapping the current 42-day
// window and report each source's actual age (lastSuccessAt/coverage from
// the published generation; generatedAt is now, never source freshness).
// The projection carries no secrets: no env names, URLs, PINs or tokens.

import { ConvexError, v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { requireUser } from "./lib/auth.js";
import {
  berlinMidnightMs,
  calendarFreshness,
  calendarWindow,
} from "./lib/calendarPolicy.js";
import type {
  CalendarFeedCalendar,
  CalendarFeedV1,
  CalendarWindow,
  NormalizedCalendarEvent,
} from "./lib/calendarTypes.js";
import {
  calendarFeedV1Validator,
} from "./lib/calendarValidators.js";

export const CALENDAR_NOT_CONFIGURED = "CalendarNotConfigured";

function notConfigured(): never {
  throw new ConvexError(
    `${CALENDAR_NOT_CONFIGURED}: the calendar setup is incomplete`,
  );
}

type FeedSource = Doc<"calendarSources">;

function coverageWindow(
  fromDate: string,
  toDate: string,
): CalendarWindow | undefined {
  if (fromDate === "" || toDate === "" || fromDate >= toDate) {
    return undefined;
  }
  return {
    fromDate,
    toDate,
    fromMs: berlinMidnightMs(fromDate),
    toMs: berlinMidnightMs(toDate),
  };
}

async function calendarEntry(
  ctx: QueryCtx,
  source: FeedSource,
  window: CalendarWindow,
  now: number,
): Promise<{ calendar: CalendarFeedCalendar; events: Array<NormalizedCalendarEvent & { calendarId: string }> }> {
  const imports = await ctx.db
    .query("calendarImports")
    .withIndex("by_source_sequence", (q) => q.eq("sourceId", source._id))
    .collect();
  const bySequenceDesc = [...imports].sort((a, b) => b.sequence - a.sequence);
  const latest = bySequenceDesc[0];
  let lastSuccessAt: number | undefined;
  for (const record of bySequenceDesc) {
    if (record.state === "ready" && record.successAt !== undefined) {
      lastSuccessAt =
        lastSuccessAt === undefined
          ? record.successAt
          : Math.max(lastSuccessAt, record.successAt);
    }
  }
  let coverage: CalendarWindow | undefined;
  if (source.publishedDataImportId !== undefined) {
    const data = await ctx.db.get(source.publishedDataImportId);
    if (data !== null) {
      coverage = coverageWindow(data.fromDate, data.toDate);
    }
  }
  const calendarId = source._id as string;
  const calendar: CalendarFeedCalendar = {
    id: calendarId,
    sourceKey: source.sourceKey,
    name: source.name,
    color: source.color,
    panel: source.panel,
    order: source.order,
    ...(source.intoCalendarId === undefined
      ? {}
      : { intoCalendarId: source.intoCalendarId as string }),
    personIds: source.personIds.map((personId) => personId as string),
    ...(latest === undefined ? {} : { lastAttemptAt: latest.startedAt }),
    ...(lastSuccessAt === undefined ? {} : { lastSuccessAt }),
    freshness: calendarFreshness(lastSuccessAt, source.intervalMs, now),
    ...(latest === undefined || (latest.state !== "ready" && latest.state !== "error")
      ? {}
      : { lastAttemptStatus: latest.state === "ready" ? ("success" as const) : ("error" as const) }),
    ...(latest !== undefined && latest.state === "error" && latest.error !== undefined
      ? { error: latest.error }
      : {}),
    ...(coverage === undefined ? {} : { coverage }),
  };
  const events: Array<NormalizedCalendarEvent & { calendarId: string }> = [];
  if (source.publishedDataImportId !== undefined) {
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_source_import_key", (q) =>
        q
          .eq("sourceId", source._id)
          .eq("importId", source.publishedDataImportId as Id<"calendarImports">),
      )
      .collect();
    for (const row of rows) {
      if (row.startMs < window.toMs && row.endMs > window.fromMs) {
        events.push({
          key: row.key,
          uid: row.uid,
          identityQuality: row.identityQuality,
          ...(row.recurrenceId === undefined ? {} : { recurrenceId: row.recurrenceId }),
          title: row.title,
          ...(row.location === undefined ? {} : { location: row.location }),
          startMs: row.startMs,
          endMs: row.endMs,
          allDay: row.allDay,
          timezone: row.timezone,
          ...(row.startDate === undefined ? {} : { startDate: row.startDate }),
          ...(row.endDate === undefined ? {} : { endDate: row.endDate }),
          calendarId,
        });
      }
    }
    events.sort((a, b) =>
      a.startMs === b.startMs
        ? (a.key < b.key ? -1 : 1)
        : a.startMs - b.startMs,
    );
  }
  return { calendar, events };
}

async function buildFeed(
  ctx: QueryCtx,
  now: number,
  include: (source: FeedSource) => boolean,
): Promise<CalendarFeedV1> {
  const settings = await ctx.db
    .query("familyBackendSettings")
    .withIndex("by_key", (q) => q.eq("key", "calendars"))
    .unique();
  if (settings === null || !settings.configured) {
    notConfigured();
  }
  const window = calendarWindow(now);
  const sources = (await ctx.db.query("calendarSources").collect())
    .filter((source) => source.enabled && source.mode === "convex" && include(source))
    .sort(
      (a, b) => a.order - b.order || (a.sourceKey < b.sourceKey ? -1 : 1),
    );
  const users = await ctx.db.query("users").collect();
  const bindings = await ctx.db.query("personSourceBindings").collect();
  const calendars: CalendarFeedCalendar[] = [];
  // Events are grouped per calendar (each entry sorted by startMs); there is
  // no global time sort across calendars (the Task 5 consumer sorts).
  const events: Array<NormalizedCalendarEvent & { calendarId: string }> = [];
  for (const source of sources) {
    const entry = await calendarEntry(ctx, source, window, now);
    calendars.push(entry.calendar);
    events.push(...entry.events);
  }
  return {
    version: 1,
    scope: "family-calendars",
    timezone: "Europe/Berlin",
    configurationRevision: settings.configurationRevision,
    generatedAt: now,
    window,
    people: users.map((user) => ({
      id: user._id as string,
      slug: user.slug,
      name: user.name,
      role: user.role,
    })),
    bindings: bindings.map((binding) => ({
      personId: binding.userId as string,
      kind: binding.kind,
      externalId: binding.externalId,
    })),
    calendars,
    events,
  };
}

// Device feed for the Go dashboard (via GET /dashboard/calendars): all
// active central calendars with their last published stand.
export const getDashboardFeed = internalQuery({
  args: {},
  returns: calendarFeedV1Validator,
  handler: async (ctx) => {
    return await buildFeed(ctx, Date.now(), () => true);
  },
});

// Role-scoped feed for app sessions. Children receive only calendars
// explicitly assigned to them; parents receive every active central
// calendar except stands explicitly assigned to a child (a family calendar
// stays parent-visible until it is assigned to a child).
export const forUser = query({
  args: { token: v.string() },
  returns: calendarFeedV1Validator,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.token);
    const now = Date.now();
    if (me.role === "parent") {
      const users = await ctx.db.query("users").collect();
      const roles = new Map(users.map((user) => [user._id, user.role]));
      return await buildFeed(ctx, now, (source) => {
        if (source.personIds.length === 0) {
          return true;
        }
        return !source.personIds.every(
          (personId) => roles.get(personId) === "child",
        );
      });
    }
    return await buildFeed(ctx, now, (source) =>
      source.personIds.some((personId) => personId === me._id),
    );
  },
});
