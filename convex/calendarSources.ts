// Guarded calendar source configuration (parent-only). Sources are the
// explicit integration registry: stable sourceKey identity, shadow-first
// onboarding, generation-guarded imports and person bindings without
// first-name guessing.

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel.js";
import { requireParent } from "./lib/auth";
import { calendarWindow } from "./lib/calendarPolicy";
import {
  MAX_CALENDAR_INTERVAL_MS,
  MAX_CALENDAR_SOURCES,
  MIN_CALENDAR_INTERVAL_MS,
  type CalendarSourceInput,
} from "./lib/calendarTypes";
import {
  calendarSourceInputValidator,
  calendarSourceModeValidator,
  calendarSourcePublicValidator,
  personSourceBindingKindValidator,
} from "./lib/calendarValidators";
import { todayBerlin } from "./lib/dates";
import type { MutationCtx } from "./_generated/server";

const SETTINGS_KEY = "calendars";
const MAX_PERSON_IDS = 50;
// Manual refresh is allowed at the earliest this long after the last
// started attempt; a valid running import is never double-started.
const MANUAL_REFRESH_THROTTLE_MS = 60000;

function configError(message: string): never {
  throw new ConvexError(`CalendarConfigError: ${message}`);
}

function checkSourceInput(source: CalendarSourceInput): void {
  if (source.sourceKey.trim() === "" || source.sourceKey.length > 64) {
    configError("sourceKey must be 1-64 characters");
  }
  const name = source.name.trim();
  if (name === "" || name.length > 120) {
    configError("name must be 1-120 characters");
  }
  const color = source.color.trim();
  if (color === "" || color.length > 32) {
    configError("color must be 1-32 characters");
  }
  if (!Number.isInteger(source.order)) {
    configError("order must be an integer");
  }
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(source.urlEnvKey)) {
    configError(
      "urlEnvKey must name a server-side env var (A-Z, 0-9, _, max 64)",
    );
  }
  if (
    !Number.isInteger(source.intervalMs) ||
    source.intervalMs < MIN_CALENDAR_INTERVAL_MS ||
    source.intervalMs > MAX_CALENDAR_INTERVAL_MS
  ) {
    configError(
      `intervalMs must be an integer between ${MIN_CALENDAR_INTERVAL_MS} and ${MAX_CALENDAR_INTERVAL_MS}`,
    );
  }
  if (source.personIds.length > MAX_PERSON_IDS) {
    configError(`personIds holds at most ${MAX_PERSON_IDS} entries`);
  }
}

// Bump the global calendars configuration revision (served as
// CalendarFeedV1.configurationRevision) and refresh the central Berlin day.
// Every source config/mode change revokes in-flight import commit
// permission via the per-source configGeneration; the global revision lets
// feed readers detect any configuration change.
async function bumpConfigurationRevision(
  ctx: MutationCtx,
  now: number,
): Promise<number> {
  const existing = await ctx.db
    .query("familyBackendSettings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
  if (existing === null) {
    await ctx.db.insert("familyBackendSettings", {
      key: SETTINGS_KEY,
      configurationRevision: 1,
      configured: false,
      berlinDate: todayBerlin(now),
      updatedAt: now,
    });
    return 1;
  }
  const configurationRevision = existing.configurationRevision + 1;
  await ctx.db.patch(existing._id, {
    configurationRevision,
    berlinDate: todayBerlin(now),
    updatedAt: now,
  });
  return configurationRevision;
}

// Validate the optional stable column target: it must exist, be a column
// calendar without its own target (no chained targets), and never resolve
// back to the source itself (no cycles).
async function checkIntoCalendarId(
  ctx: MutationCtx,
  intoCalendarId: Id<"calendarSources"> | undefined,
  selfId: Id<"calendarSources"> | null,
  selfSourceKey: string,
): Promise<void> {
  if (intoCalendarId === undefined) {
    return;
  }
  const seen = new Set<string>();
  if (selfId !== null) {
    seen.add(selfId);
  }
  let current: Id<"calendarSources"> | undefined = intoCalendarId;
  while (current !== undefined) {
    const id: Id<"calendarSources"> = current;
    if (seen.has(id)) {
      configError("intoCalendarId must not create a cycle");
    }
    seen.add(id);
    const target = await ctx.db.get(id);
    if (target === null) {
      configError("intoCalendarId references an unknown calendar source");
    }
    if (target.sourceKey === selfSourceKey && selfId === null) {
      configError("intoCalendarId must not reference the source itself");
    }
    if (target.intoCalendarId !== undefined) {
      configError("intoCalendarId must not chain column targets");
    }
    if (target.panel !== "column") {
      configError("intoCalendarId must reference a column calendar");
    }
    current = target.intoCalendarId;
  }
}

// Parent-only source directory, ordered for display (order, then key).
export const list = query({
  args: { token: v.string() },
  returns: v.array(calendarSourcePublicValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const sources = await ctx.db.query("calendarSources").collect();
    sources.sort(
      (a, b) => a.order - b.order || (a.sourceKey < b.sourceKey ? -1 : 1),
    );
    return sources;
  },
});

// Create or update a source by its stable sourceKey: renames and reorders
// keep the same document ID. Every write bumps configGeneration (revoking
// in-flight import commit permission) and the global configurationRevision.
// New sources start disabled in shadow mode for comparison before
// activation; save() never takes over import state.
export const save = mutation({
  args: { token: v.string(), source: calendarSourceInputValidator },
  returns: v.id("calendarSources"),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    checkSourceInput(args.source);
    const existing = await ctx.db
      .query("calendarSources")
      .withIndex("by_sourceKey", (q) =>
        q.eq("sourceKey", args.source.sourceKey),
      )
      .unique();
    for (const userId of args.source.personIds) {
      if ((await ctx.db.get(userId)) === null) {
        configError("personIds references an unknown user");
      }
    }
    await checkIntoCalendarId(
      ctx,
      args.source.intoCalendarId,
      existing?._id ?? null,
      args.source.sourceKey,
    );
    if (existing === null) {
      const count = (await ctx.db.query("calendarSources").collect()).length;
      if (count >= MAX_CALENDAR_SOURCES) {
        configError(
          `at most ${MAX_CALENDAR_SOURCES} calendar sources are supported`,
        );
      }
    }
    const now = Date.now();
    await bumpConfigurationRevision(ctx, now);
    const intervalMs = args.source.intervalMs;
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        name: args.source.name.trim(),
        color: args.source.color.trim(),
        panel: args.source.panel,
        order: args.source.order,
        intoCalendarId: args.source.intoCalendarId,
        personIds: args.source.personIds,
        urlEnvKey: args.source.urlEnvKey,
        enabled: args.source.enabled,
        intervalMs,
        configGeneration: existing.configGeneration + 1,
      });
      return existing._id;
    }
    return await ctx.db.insert("calendarSources", {
      sourceKey: args.source.sourceKey,
      name: args.source.name.trim(),
      color: args.source.color.trim(),
      panel: args.source.panel,
      order: args.source.order,
      intoCalendarId: args.source.intoCalendarId,
      personIds: args.source.personIds,
      urlEnvKey: args.source.urlEnvKey,
      enabled: false,
      mode: "shadow",
      intervalMs,
      configGeneration: 1,
    });
  },
});

// Explicit setup flag for the calendar feed (Task 4). A missing settings
// document or configured=false means "not set up yet" (the HTTP feed
// answers 503); a deliberately empty selection uses configured=true and
// serves the full v1 document with empty arrays. Every change bumps the
// global configurationRevision served to feed readers.
export const setConfigured = mutation({
  args: { token: v.string(), configured: v.boolean() },
  returns: v.object({ configurationRevision: v.number() }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const now = Date.now();
    const existing = await ctx.db
      .query("familyBackendSettings")
      .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
      .unique();
    if (existing === null) {
      await ctx.db.insert("familyBackendSettings", {
        key: SETTINGS_KEY,
        configurationRevision: 1,
        configured: args.configured,
        berlinDate: todayBerlin(now),
        updatedAt: now,
      });
      return { configurationRevision: 1 };
    }
    const configurationRevision = existing.configurationRevision + 1;
    await ctx.db.patch(existing._id, {
      configurationRevision,
      configured: args.configured,
      berlinDate: todayBerlin(now),
      updatedAt: now,
    });
    return { configurationRevision };
  },
});

// Bounded manual refresh (Task 4, parent-only). Schedules the same central
// fetch action as the minute dispatcher and defers the next regular slot.
// Fails closed without scheduling when the source is not centrally polled,
// a valid import is already running ("running"), or the last attempt
// started less than a minute ago ("throttled").
export const requestRefresh = mutation({
  args: { token: v.string(), sourceId: v.id("calendarSources") },
  returns: v.object({
    started: v.boolean(),
    reason: v.union(v.literal("running"), v.literal("throttled"), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const now = Date.now();
    const source = await ctx.db.get(args.sourceId);
    if (source === null) {
      configError("unknown calendar source");
    }
    if (!source.enabled || source.mode !== "convex") {
      return { started: false, reason: null };
    }
    if (source.runningImportId !== undefined) {
      const active = await ctx.db.get(source.runningImportId);
      if (
        active !== null &&
        (active.state === "running" || active.state === "staging") &&
        (active.leaseExpiresAt ?? 0) > now &&
        active.configGeneration === source.configGeneration
      ) {
        return { started: false, reason: "running" as const };
      }
    }
    const history = await ctx.db
      .query("calendarImports")
      .withIndex("by_source_sequence", (q) => q.eq("sourceId", source._id))
      .collect();
    const latest = history.sort((a, b) => b.sequence - a.sequence)[0];
    if (
      latest !== undefined &&
      now - latest.startedAt < MANUAL_REFRESH_THROTTLE_MS
    ) {
      return { started: false, reason: "throttled" as const };
    }
    await ctx.scheduler.runAfter(0, internal.calendarFetch.fetchCalendar, {
      sourceId: source._id,
    });
    await ctx.db.patch(source._id, {
      nextAttemptAt: now + source.intervalMs,
    });
    return { started: true, reason: null };
  },
});

// Bind an internal user to an external account (besteschule, timetable).
// The (kind, externalId) pair is unique: ambiguous mappings are
// configuration errors, never auto-linked by first name.
export const bindPerson = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
    kind: personSourceBindingKindValidator,
    externalId: v.string(),
  },
  returns: v.id("personSourceBindings"),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      configError("unknown user");
    }
    const externalId = args.externalId.trim();
    if (externalId === "") {
      configError("externalId must not be empty");
    }
    const duplicate = await ctx.db
      .query("personSourceBindings")
      .withIndex("by_kind_externalId", (q) =>
        q.eq("kind", args.kind).eq("externalId", externalId),
      )
      .unique();
    if (duplicate !== null) {
      configError("duplicate binding for this external account");
    }
    return await ctx.db.insert("personSourceBindings", {
      userId: args.userId,
      kind: args.kind,
      externalId,
    });
  },
});

// Switch a source between shadow, convex and local. Activating "convex"
// requires a successful current-generation import covering the current
// 42-day window. Every mode change bumps configGeneration and the global
// configurationRevision, revoking in-flight commit permission. Local mode is
// never polled centrally, so it disables the source.
export const activate = mutation({
  args: {
    token: v.string(),
    sourceId: v.id("calendarSources"),
    mode: calendarSourceModeValidator,
  },
  returns: v.object({ configurationRevision: v.number() }),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const source = await ctx.db.get(args.sourceId);
    if (source === null) {
      configError("unknown calendar source");
    }
    if (args.mode === "convex") {
      const window = calendarWindow(Date.now());
      const imports = await ctx.db
        .query("calendarImports")
        .withIndex("by_source_sequence", (q) => q.eq("sourceId", args.sourceId))
        .collect();
      const qualifies = imports.some(
        (record) =>
          record.state === "ready" &&
          record.configGeneration === source.configGeneration &&
          record.fromDate <= window.fromDate &&
          record.toDate >= window.toDate,
      );
      if (!qualifies) {
        configError(
          "activation needs a successful current-generation import covering the current 42-day window",
        );
      }
    }
    const now = Date.now();
    const configurationRevision = await bumpConfigurationRevision(ctx, now);
    await ctx.db.patch(source._id, {
      mode: args.mode,
      enabled: args.mode !== "local",
      configGeneration: source.configGeneration + 1,
    });
    return { configurationRevision };
  },
});
