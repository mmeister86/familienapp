// Guarded calendar source configuration (parent-only). Sources are the
// explicit integration registry: stable sourceKey identity, shadow-first
// onboarding, generation-guarded imports and person bindings without
// first-name guessing.

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireParent } from "./lib/auth";
import { calendarWindow } from "./lib/calendarPolicy";
import {
  DEFAULT_CALENDAR_INTERVAL_MS,
  type CalendarSourceInput,
} from "./lib/calendarTypes";
import {
  calendarSourceInputValidator,
  calendarSourceModeValidator,
  calendarSourcePublicValidator,
  personSourceBindingKindValidator,
} from "./lib/calendarValidators";

const MIN_INTERVAL_MS = 60 * 1000;

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
  if (source.kind === "ics") {
    if (
      source.url === undefined ||
      !/^(https?|webcal):\/\/.+/.test(source.url)
    ) {
      configError('kind "ics" requires an http(s) or webcal feed url');
    }
  }
  if (
    source.intervalMs !== undefined &&
    (!Number.isInteger(source.intervalMs) ||
      source.intervalMs < MIN_INTERVAL_MS)
  ) {
    configError("intervalMs must be an integer of at least 60000");
  }
}

// Parent-only source directory, ordered for display (sortOrder, then key).
export const list = query({
  args: { token: v.string() },
  returns: v.array(calendarSourcePublicValidator),
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const sources = await ctx.db.query("calendarSources").collect();
    sources.sort(
      (a, b) => a.sortOrder - b.sortOrder || (a.sourceKey < b.sourceKey ? -1 : 1),
    );
    return sources;
  },
});

// Create or update a source by its stable sourceKey: renames and reorders
// keep the same document ID. Every write bumps configurationRevision, which
// revokes in-flight import commit permission. New sources start disabled in
// shadow mode for comparison before activation.
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
    const intervalMs =
      args.source.intervalMs ??
      existing?.intervalMs ??
      DEFAULT_CALENDAR_INTERVAL_MS;
    const url = args.source.kind === "ics" ? args.source.url : undefined;
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        name: args.source.name.trim(),
        kind: args.source.kind,
        url,
        color: args.source.color,
        sortOrder: args.source.sortOrder ?? existing.sortOrder,
        intervalMs,
        configurationRevision: existing.configurationRevision + 1,
      });
      return existing._id;
    }
    return await ctx.db.insert("calendarSources", {
      sourceKey: args.source.sourceKey,
      name: args.source.name.trim(),
      kind: args.source.kind,
      url,
      color: args.source.color,
      enabled: false,
      mode: "shadow",
      sortOrder: args.source.sortOrder ?? 0,
      intervalMs,
      configurationRevision: 1,
    });
  },
});

// Bind an internal user to an external account (calendar, school, meal).
// The (userId, kind, externalId) triple is unique: ambiguous mappings are
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
      .withIndex("by_lookup", (q) =>
        q
          .eq("userId", args.userId)
          .eq("kind", args.kind)
          .eq("externalId", externalId),
      )
      .unique();
    if (duplicate !== null) {
      configError("duplicate binding for this person and external account");
    }
    return await ctx.db.insert("personSourceBindings", {
      userId: args.userId,
      kind: args.kind,
      externalId,
    });
  },
});

// Switch a source between shadow and active. Activating requires a
// successful current-generation import covering the current 42-day window.
// Every mode change bumps configurationRevision and revokes in-flight
// commit permission.
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
    if (args.mode === "active") {
      const window = calendarWindow(Date.now());
      const imports = await ctx.db
        .query("calendarImports")
        .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
        .collect();
      const qualifies = imports.some(
        (record) =>
          record.status === "committed" &&
          record.generation === source.configurationRevision &&
          record.windowStart <= window.startDate &&
          record.windowEnd >= window.endDate,
      );
      if (!qualifies) {
        configError(
          "activation needs a successful current-generation import covering the current 42-day window",
        );
      }
    }
    const configurationRevision = source.configurationRevision + 1;
    await ctx.db.patch(source._id, {
      mode: args.mode,
      enabled: args.mode === "active",
      configurationRevision,
    });
    return { configurationRevision };
  },
});
