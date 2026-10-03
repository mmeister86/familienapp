// Generation-guarded calendar imports with atomic publication (Task 3).
//
// Protocol (consumed by the Task-4 fetch action, never by clients):
//   claim -> stage (0..n-1, in order) -> publish | publishUnchanged | fail
//
// Guarantees:
// - One lease-holder per source. claim() returns null while a valid lease
//   exists; an expired holder is marked superseded and replaced.
// - Every config/mode write bumps calendarSources.configGeneration. All
//   stage/publish/fail calls carry the generation they were issued for and
//   fail closed when it no longer matches the source or the run.
// - Staged rows are isolated by import run id; no success pointer moves
//   before publish() fully validates (all batches present, staged count and
//   key-uniqueness match, recomputed contentFingerprint matches).
// - publishUnchanged() refreshes success metadata for an identical stand
//   (same fingerprint AND same window) while keeping publishedDataImportId.
// - fail() from a superseded/expired run writes no error and reschedules
//   nothing. Retry: 30s then 60s with up to 20% jitter for transient
//   classes (Retry-After raises the floor); after three short tries, or for
//   auth/parse/oversize classes, the next regular interval applies.
// - cleanup() deletes only whole abandoned/retired generations in bounded
//   batches and retains the active plus the previous data generation
//   (including reused older data). It never deletes single out-of-window
//   events of a live generation.
// - Feed reads (Task 4) go through activeEvents(): only events of the
//   published data import overlapping the requested window. All timestamps
//   come from mutation time (Date.now()); no URLs or tokens are stored.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { contentFingerprint } from "./lib/calendarFingerprint.js";
import { calendarWindow } from "./lib/calendarPolicy.js";
import { todayBerlin } from "./lib/dates.js";
import type { NormalizedCalendarEvent } from "./lib/calendarTypes.js";
import {
  calendarWindowValidator,
  normalizedCalendarEventValidator,
} from "./lib/calendarValidators.js";

// Single commit permission per source: a crashed run blocks a new claim for
// this long, then the next claim supersedes it.
const LEASE_MS = 120000;
// First short retry after 30s, subsequent short retries after 60s.
const SHORT_RETRY_FIRST_MS = 30000;
const SHORT_RETRY_NEXT_MS = 60000;
// Jitter is additive only (never earlier than the base delay).
const SHORT_RETRY_JITTER_RATIO = 0.2;
// At most three short retries per cycle; afterwards the regular interval.
const MAX_SHORT_RETRIES = 3;
// Bounds from the plan ("Grenzen und Defaults").
const MAX_BATCH_EVENTS = 100;
const MAX_EVENTS_PER_IMPORT = 2000;
// Bounded cleanup: rows removed per call.
const MAX_CLEANUP_IMPORTS = 20;
const MAX_CLEANUP_EVENTS = 200;
// Import metadata retention: latest attempts per source.
const RETAINED_ATTEMPTS = 20;

const calendarErrorClassValidator = v.union(
  v.literal("timeout"),
  v.literal("network"),
  v.literal("rateLimited"),
  v.literal("server"),
  v.literal("auth"),
  v.literal("parse"),
  v.literal("tooLarge"),
);

type CalendarErrorClass =
  | "timeout"
  | "network"
  | "rateLimited"
  | "server"
  | "auth"
  | "parse"
  | "tooLarge";

// Transient classes earn short retries; auth/parse/oversize wait for the
// regular interval, a config change or a manual refresh.
const RETRYABLE_ERROR_CLASSES: ReadonlySet<CalendarErrorClass> = new Set([
  "timeout",
  "network",
  "rateLimited",
  "server",
]);

// Sanitized parent-safe messages. Raw provider output (URLs, tokens,
// exception strings) is never stored.
const SANITIZED_ERROR_MESSAGES: Record<CalendarErrorClass, string> = {
  timeout: "Der Kalenderabruf hat zu lange gedauert und wurde abgebrochen.",
  network: "Der Kalenderserver war nicht erreichbar.",
  rateLimited:
    "Der Kalenderserver bittet um eine Pause (zu viele Anfragen).",
  server: "Der Kalenderserver meldet einen voruebergehenden Fehler.",
  auth: "Die Kalenderanmeldung ist fehlgeschlagen. Bitte die Konfiguration pruefen.",
  parse:
    "Die Kalenderdaten konnten nicht gelesen werden. Bitte die Konfiguration pruefen.",
  tooLarge: "Die Kalenderantwort ist zu gross und wurde abgelehnt.",
};

const claimResultValidator = v.union(
  v.object({
    runId: v.id("calendarImports"),
    sourceId: v.id("calendarSources"),
    configGeneration: v.number(),
    window: calendarWindowValidator,
    urlEnvKey: v.string(),
    previousFingerprint: v.optional(v.string()),
  }),
  v.null(),
);

const acceptedValidator = v.object({ accepted: v.boolean() });

type ActiveRun = {
  run: Doc<"calendarImports">;
  source: Doc<"calendarSources">;
  now: number;
};

// Fail-closed currency check shared by stage/publish/publishUnchanged/fail:
// the run must still be the source's active in-flight run, on the current
// generation, within its lease. Anything else (expired, superseded,
// revoked by a config change) returns null and the caller changes nothing.
async function loadActiveRun(
  ctx: MutationCtx,
  runId: Id<"calendarImports">,
  configGeneration: number,
): Promise<ActiveRun | null> {
  const now = Date.now();
  const run = await ctx.db.get(runId);
  if (run === null || run.configGeneration !== configGeneration) {
    return null;
  }
  if (run.state !== "running" && run.state !== "staging") {
    return null;
  }
  if ((run.leaseExpiresAt ?? 0) <= now) {
    return null;
  }
  const source = await ctx.db.get(run.sourceId);
  if (source === null) {
    return null;
  }
  if (source.configGeneration !== configGeneration) {
    return null;
  }
  if (source.runningImportId !== run._id) {
    return null;
  }
  return { run, source, now };
}

function toNormalized(
  row: Doc<"calendarEvents">,
): NormalizedCalendarEvent {
  return {
    key: row.key,
    uid: row.uid,
    identityQuality: row.identityQuality,
    recurrenceId: row.recurrenceId,
    title: row.title,
    location: row.location,
    startMs: row.startMs,
    endMs: row.endMs,
    allDay: row.allDay,
    timezone: row.timezone,
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

// Claim the commit permission for one source. Returns null while another
// run holds a valid lease, or when the source cannot be polled centrally
// (disabled or local mode). Local mode is never claimed: it has no central
// fetch and must not create import rows.
export const claim = internalMutation({
  args: { sourceId: v.id("calendarSources") },
  returns: claimResultValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const source = await ctx.db.get(args.sourceId);
    if (source === null || !source.enabled || source.mode === "local") {
      return null;
    }
    if (source.runningImportId !== undefined) {
      const active = await ctx.db.get(source.runningImportId);
      if (
        active !== null &&
        (active.state === "running" || active.state === "staging")
      ) {
        const leaseValid = (active.leaseExpiresAt ?? 0) > now;
        const committable =
          active.configGeneration === source.configGeneration;
        if (leaseValid && committable) {
          return null;
        }
        // Expired, or revoked by a config/mode change (its generation can
        // never commit again): revoke the run so its late return can no
        // longer publish or fail, and let the new claim proceed.
        await ctx.db.patch(active._id, { state: "superseded" });
      }
    }
    const previous = await ctx.db
      .query("calendarImports")
      .withIndex("by_source_sequence", (q) => q.eq("sourceId", source._id))
      .collect();
    const sequence =
      previous.reduce((max, record) => Math.max(max, record.sequence), 0) + 1;
    const window = calendarWindow(now);
    const leaseExpiresAt = now + LEASE_MS;
    const dataImport =
      source.publishedDataImportId === undefined
        ? null
        : await ctx.db.get(source.publishedDataImportId);
    const runId = await ctx.db.insert("calendarImports", {
      sourceId: source._id,
      sequence,
      configGeneration: source.configGeneration,
      state: "running",
      fromDate: window.fromDate,
      toDate: window.toDate,
      startedAt: now,
      leaseExpiresAt,
      batchCount: 0,
      batchTotal: 0,
    });
    await ctx.db.patch(source._id, {
      runningImportId: runId,
      leaseExpiresAt,
      // Defers the next regular slot while in flight; retry paths overwrite.
      nextAttemptAt: now + source.intervalMs,
    });
    const previousFingerprint = dataImport?.contentFingerprint;
    return {
      runId,
      sourceId: source._id,
      configGeneration: source.configGeneration,
      window,
      urlEnvKey: source.urlEnvKey,
      ...(previousFingerprint === undefined ? {} : { previousFingerprint }),
    };
  },
});

// Stage one batch of normalized events, isolated under the run id.
// Batches arrive in order (0..n-1); a repeated batchIndex upserts the same
// rows again (idempotent), a skipped index is rejected so publish() can
// rely on batchTotal as the count of received batches.
export const stage = internalMutation({
  args: {
    runId: v.id("calendarImports"),
    configGeneration: v.number(),
    batchIndex: v.number(),
    events: v.array(normalizedCalendarEventValidator),
  },
  returns: acceptedValidator,
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.batchIndex) || args.batchIndex < 0) {
      return { accepted: false };
    }
    if (args.events.length > MAX_BATCH_EVENTS) {
      return { accepted: false };
    }
    const active = await loadActiveRun(
      ctx,
      args.runId,
      args.configGeneration,
    );
    if (active === null) {
      return { accepted: false };
    }
    const received = active.run.batchTotal ?? 0;
    if (args.batchIndex > received) {
      return { accepted: false };
    }
    for (const event of args.events) {
      const existing = await ctx.db
        .query("calendarEvents")
        .withIndex("by_source_import_key", (q) =>
          q
            .eq("sourceId", active.run.sourceId)
            .eq("importId", active.run._id)
            .eq("key", event.key),
        )
        .unique();
      if (existing !== null) {
        await ctx.db.patch(existing._id, { ...event });
      } else {
        await ctx.db.insert("calendarEvents", {
          sourceId: active.run.sourceId,
          importId: active.run._id,
          ...event,
        });
      }
    }
    await ctx.db.patch(active.run._id, {
      state: "staging",
      batchTotal: args.batchIndex === received ? received + 1 : received,
    });
    return { accepted: true };
  },
});

// Atomically publish a fully staged run: all expected batches present, the
// staged count and key-uniqueness match the declaration, and the fingerprint
// recomputed inside this mutation matches. Success switches the published
// import and its data pointer plus coverage together; the replaced
// publication is retired to "superseded" (its rows stay for cleanup
// retention, never served again).
export const publish = internalMutation({
  args: {
    runId: v.id("calendarImports"),
    configGeneration: v.number(),
    batchCount: v.number(),
    eventCount: v.number(),
    contentFingerprint: v.string(),
  },
  returns: acceptedValidator,
  handler: async (ctx, args) => {
    if (
      !Number.isInteger(args.batchCount) ||
      args.batchCount < 0 ||
      !Number.isInteger(args.eventCount) ||
      args.eventCount < 0 ||
      args.eventCount > MAX_EVENTS_PER_IMPORT
    ) {
      return { accepted: false };
    }
    const active = await loadActiveRun(
      ctx,
      args.runId,
      args.configGeneration,
    );
    if (active === null) {
      return { accepted: false };
    }
    if ((active.run.batchTotal ?? 0) !== args.batchCount) {
      return { accepted: false };
    }
    const staged = await ctx.db
      .query("calendarEvents")
      .withIndex("by_source_import_key", (q) =>
        q.eq("sourceId", active.run.sourceId).eq("importId", active.run._id),
      )
      .collect();
    if (staged.length !== args.eventCount) {
      return { accepted: false };
    }
    if (new Set(staged.map((row) => row.key)).size !== staged.length) {
      return { accepted: false };
    }
    const actual = contentFingerprint(
      { fromDate: active.run.fromDate, toDate: active.run.toDate },
      staged.map(toNormalized),
    );
    if (actual !== args.contentFingerprint) {
      return { accepted: false };
    }
    await ctx.db.patch(active.run._id, {
      state: "ready",
      successAt: active.now,
      eventCount: args.eventCount,
      batchCount: args.batchCount,
      contentFingerprint: args.contentFingerprint,
    });
    if (
      active.source.publishedImportId !== undefined &&
      active.source.publishedImportId !== active.run._id
    ) {
      await ctx.db.patch(active.source.publishedImportId, {
        state: "superseded",
      });
    }
    await ctx.db.patch(active.source._id, {
      publishedImportId: active.run._id,
      publishedDataImportId: active.run._id,
      runningImportId: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: active.now + active.source.intervalMs,
    });
    return { accepted: true };
  },
});

// Publish an unchanged stand without staging: the fingerprint must equal the
// current published data fingerprint AND the window must be unchanged. Only
// success metadata advances; the data pointer is preserved so no event is
// rewritten and cleanup keeps the reused older generation.
export const publishUnchanged = internalMutation({
  args: {
    runId: v.id("calendarImports"),
    configGeneration: v.number(),
    contentFingerprint: v.string(),
  },
  returns: acceptedValidator,
  handler: async (ctx, args) => {
    const active = await loadActiveRun(
      ctx,
      args.runId,
      args.configGeneration,
    );
    if (active === null) {
      return { accepted: false };
    }
    if (active.source.publishedDataImportId === undefined) {
      return { accepted: false };
    }
    const data = await ctx.db.get(active.source.publishedDataImportId);
    if (data === null) {
      return { accepted: false };
    }
    if (data.contentFingerprint !== args.contentFingerprint) {
      return { accepted: false };
    }
    if (
      data.fromDate !== active.run.fromDate ||
      data.toDate !== active.run.toDate
    ) {
      return { accepted: false };
    }
    const staged = await ctx.db
      .query("calendarEvents")
      .withIndex("by_source_import_key", (q) =>
        q.eq("sourceId", active.run.sourceId).eq("importId", active.run._id),
      )
      .collect();
    if (staged.length > 0) {
      return { accepted: false };
    }
    await ctx.db.patch(active.run._id, {
      state: "ready",
      successAt: active.now,
      eventCount: data.eventCount ?? 0,
      batchCount: 0,
      batchTotal: 0,
      contentFingerprint: args.contentFingerprint,
    });
    if (
      active.source.publishedImportId !== undefined &&
      active.source.publishedImportId !== active.run._id
    ) {
      // May mark the still-serving data generation row superseded; reads/cleanup are pointer-based.
      await ctx.db.patch(active.source.publishedImportId, {
        state: "superseded",
      });
    }
    await ctx.db.patch(active.source._id, {
      publishedImportId: active.run._id,
      runningImportId: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: active.now + active.source.intervalMs,
    });
    return { accepted: true };
  },
});

// Record a classified failure. Only the active run may fail: a superseded
// or expired run writes no error and reschedules nothing, so last-good and
// the current retry schedule stay untouched.
export const fail = internalMutation({
  args: {
    runId: v.id("calendarImports"),
    configGeneration: v.number(),
    errorClass: calendarErrorClassValidator,
    retryAfterMs: v.optional(v.number()),
  },
  returns: acceptedValidator,
  handler: async (ctx, args) => {
    const active = await loadActiveRun(
      ctx,
      args.runId,
      args.configGeneration,
    );
    if (active === null) {
      return { accepted: false };
    }
    const history = await ctx.db
      .query("calendarImports")
      .withIndex("by_source_sequence", (q) =>
        q.eq("sourceId", active.source._id),
      )
      .collect();
    const ordered = history
      .filter((record) => record._id !== active.run._id)
      .sort((a, b) => b.sequence - a.sequence);
    let shortTries = 0;
    for (const record of ordered) {
      if (record.state !== "error") {
        break;
      }
      shortTries += 1;
    }
    const retryAfterFloor =
      args.retryAfterMs !== undefined &&
      Number.isFinite(args.retryAfterMs) &&
      args.retryAfterMs > 0
        ? args.retryAfterMs
        : 0;
    let delayMs: number;
    if (
      RETRYABLE_ERROR_CLASSES.has(args.errorClass) &&
      shortTries < MAX_SHORT_RETRIES
    ) {
      const base =
        shortTries === 0 ? SHORT_RETRY_FIRST_MS : SHORT_RETRY_NEXT_MS;
      delayMs =
        base + Math.random() * SHORT_RETRY_JITTER_RATIO * base;
      delayMs = Math.max(delayMs, retryAfterFloor);
    } else {
      // Auth/parse/oversize failures and exhausted short retries wait for
      // the regular interval, a config change or a manual refresh.
      delayMs = Math.max(active.source.intervalMs, retryAfterFloor);
    }
    await ctx.db.patch(active.run._id, {
      state: "error",
      error: SANITIZED_ERROR_MESSAGES[args.errorClass],
    });
    await ctx.db.patch(active.source._id, {
      runningImportId: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: active.now + delayMs,
    });
    return { accepted: true };
  },
});

// Bounded cleanup for one source. Retains the latest attempt rows plus the
// records referenced by the active and the immediately preceding data
// generation (including reused older data); deletes older/abandoned staging
// in bounded batches. Never deletes single out-of-window events of a live
// generation: event deletion always removes whole retired generations.
export const cleanup = internalMutation({
  args: { sourceId: v.id("calendarSources") },
  returns: v.object({ deleted: v.number(), remaining: v.boolean() }),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (source === null) {
      return { deleted: 0, remaining: false };
    }
    const now = Date.now();
    const imports = await ctx.db
      .query("calendarImports")
      .withIndex("by_source_sequence", (q) => q.eq("sourceId", source._id))
      .collect();

    // Revoke crashed in-flight runs (expired lease without a commit) so a
    // late return can no longer publish or fail and their staged rows
    // become collectable below. Revoking the current pointer also makes
    // the source due again instead of stalling until the next claim.
    let currentRunId = source.runningImportId;
    for (const record of imports) {
      if (
        (record.state === "running" || record.state === "staging") &&
        (record.leaseExpiresAt ?? 0) <= now
      ) {
        await ctx.db.patch(record._id, { state: "superseded" });
        record.state = "superseded";
        if (record._id === currentRunId) {
          currentRunId = undefined;
        }
      }
    }
    if (currentRunId === undefined && source.runningImportId !== undefined) {
      await ctx.db.patch(source._id, {
        runningImportId: undefined,
        leaseExpiresAt: undefined,
        nextAttemptAt: now,
      });
    }

    const bySequenceDesc = [...imports].sort(
      (a, b) => b.sequence - a.sequence,
    );
    const retainImports = new Set<string>();
    for (const record of bySequenceDesc.slice(0, RETAINED_ATTEMPTS)) {
      retainImports.add(record._id);
    }
    if (source.publishedImportId !== undefined) {
      retainImports.add(source.publishedImportId);
    }
    if (source.publishedDataImportId !== undefined) {
      retainImports.add(source.publishedDataImportId);
    }

    // Previous data generation: nearest older successful stand that still
    // holds event rows. An unchanged publication holds no rows itself, so
    // the walk skips it and retains the reused older data it points at.
    const retainEvents = new Set<string>();
    if (source.publishedDataImportId !== undefined) {
      retainEvents.add(source.publishedDataImportId);
    }
    const publishedSequence =
      source.publishedImportId === undefined
        ? undefined
        : bySequenceDesc.find(
            (record) => record._id === source.publishedImportId,
          )?.sequence;
    if (publishedSequence !== undefined) {
      const predecessors = bySequenceDesc
        .filter(
          (record) =>
            record.sequence < publishedSequence &&
            (record.state === "ready" || record.state === "superseded"),
        )
        .slice(0, 30);
      for (const record of predecessors) {
        const probe = await ctx.db
          .query("calendarEvents")
          .withIndex("by_source_import_key", (q) =>
            q.eq("sourceId", source._id).eq("importId", record._id),
          )
          .take(1);
        if (probe.length > 0) {
          retainEvents.add(record._id);
          retainImports.add(record._id);
          break;
        }
      }
    }

    let deleted = 0;
    let eventBudget = MAX_CLEANUP_EVENTS;

    // Phase 1: whole retired generations of events. The active data
    // generation, the previous one and the current in-flight run are
    // never touched.
    const eventVictims = bySequenceDesc
      .filter(
        (record) =>
          !retainEvents.has(record._id) && record._id !== currentRunId,
      )
      .sort((a, b) => a.sequence - b.sequence);
    let eventsCapped = false;
    for (const record of eventVictims) {
      if (eventBudget <= 0) {
        eventsCapped = true;
        break;
      }
      const allowance = eventBudget;
      const rows = await ctx.db
        .query("calendarEvents")
        .withIndex("by_source_import_key", (q) =>
          q.eq("sourceId", source._id).eq("importId", record._id),
        )
        .take(allowance);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
      eventBudget -= rows.length;
      if (rows.length === allowance) {
        eventsCapped = true;
      }
    }

    // Phase 2: retired import rows, oldest first, only once their events
    // are gone; bounded per call.
    let importBudget = MAX_CLEANUP_IMPORTS;
    const rowVictims = bySequenceDesc
      .filter((record) => !retainImports.has(record._id))
      .sort((a, b) => a.sequence - b.sequence);
    let pendingRows = 0;
    for (const record of rowVictims) {
      if (importBudget <= 0) {
        pendingRows += 1;
        continue;
      }
      const leftover = await ctx.db
        .query("calendarEvents")
        .withIndex("by_source_import_key", (q) =>
          q.eq("sourceId", source._id).eq("importId", record._id),
        )
        .take(1);
      if (leftover.length > 0) {
        // Events did not fit into this call's budget: keep the row so the
        // next call finds them again.
        pendingRows += 1;
        continue;
      }
      await ctx.db.delete(record._id);
      deleted += 1;
      importBudget -= 1;
    }

    // Remaining work: rows still outside retention, or the event budget ran
    // out. Report conservatively: capped budgets may leave deletable events
    // even when no pending row was observed this call.
    let remaining = pendingRows > 0;
    remaining ||= eventsCapped;
    return { deleted, remaining };
  },
});

// Minute dispatcher (Task 4): schedules every due enabled central source
// through the fetch action and advances the stored Berlin day. Due means
// the regular slot arrived (no future nextAttemptAt) and no valid running
// import exists; scheduling reserves the next slot so the following tick
// skips the source until the action claims (or fails) and reschedules.
// Coverage never advances here: only a later fetch publish moves it.
export const dispatch = internalMutation({
  args: {},
  returns: v.object({
    scheduled: v.array(v.id("calendarSources")),
    berlinDate: v.string(),
  }),
  handler: async (ctx, args) => {
    void args;
    const now = Date.now();
    const berlinDate = todayBerlin(now);
    const existing = await ctx.db
      .query("familyBackendSettings")
      .withIndex("by_key", (q) => q.eq("key", "calendars"))
      .unique();
    if (existing === null) {
      await ctx.db.insert("familyBackendSettings", {
        key: "calendars",
        configurationRevision: 0,
        configured: false,
        berlinDate,
        updatedAt: now,
      });
    } else if (existing.berlinDate !== berlinDate) {
      await ctx.db.patch(existing._id, { berlinDate, updatedAt: now });
    }
    const sources = await ctx.db.query("calendarSources").collect();
    const scheduled: Id<"calendarSources">[] = [];
    for (const source of sources) {
      if (!source.enabled || source.mode !== "convex") {
        continue;
      }
      if (
        source.nextAttemptAt !== undefined &&
        source.nextAttemptAt > now
      ) {
        continue;
      }
      if (source.runningImportId !== undefined) {
        const active = await ctx.db.get(source.runningImportId);
        if (
          active !== null &&
          (active.state === "running" || active.state === "staging") &&
          (active.leaseExpiresAt ?? 0) > now &&
          active.configGeneration === source.configGeneration
        ) {
          continue;
        }
      }
      await ctx.scheduler.runAfter(0, internal.calendarFetch.fetchCalendar, {
        sourceId: source._id,
      });
      await ctx.db.patch(source._id, {
        nextAttemptAt: now + source.intervalMs,
      });
      scheduled.push(source._id);
    }
    scheduled.sort();
    return { scheduled, berlinDate };
  },
});

// Feed read pattern for Task 4: only events of the published data import
// that overlap [fromMs, toMs). Staged, failed and superseded rows are never
// served; out-of-window rows of the active stand are filtered here as well.
export const activeEvents = internalQuery({
  args: {
    sourceId: v.id("calendarSources"),
    fromMs: v.number(),
    toMs: v.number(),
  },
  returns: v.array(normalizedCalendarEventValidator),
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (source === null) {
      return [];
    }
    const dataImportId = source.publishedDataImportId;
    if (dataImportId === undefined) {
      return [];
    }
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_source_import_key", (q) =>
        q.eq("sourceId", args.sourceId).eq("importId", dataImportId),
      )
      .collect();
    return rows
      .filter((row) => row.startMs < args.toMs && row.endMs > args.fromMs)
      .map(toNormalized)
      .sort((a, b) =>
        a.startMs === b.startMs
          ? (a.key < b.key ? -1 : 1)
          : a.startMs - b.startMs,
      );
  },
});
