// Generation-guarded calendar imports and atomic publication (Task 3).
//
// These DB tests pin the import protocol before it exists: a lease-holder
// claims, stages isolated batches and publishes atomically; stale,
// expired or superseded runs fail closed without touching the last-good
// stand. Feed visibility comes only from the published data pointer.

import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import { contentFingerprint } from "../../convex/lib/calendarFingerprint.js";
import {
  calendarFreshness,
  occurrenceKey,
} from "../../convex/lib/calendarPolicy.js";
import type {
  CalendarWindow,
  NormalizedCalendarEvent,
} from "../../convex/lib/calendarTypes.js";
import {
  createParentSession,
  setupCalendarTest,
} from "./setup.js";

type CalendarTest = ReturnType<typeof setupCalendarTest>;

const FAMILY_SOURCE = {
  sourceKey: "family",
  name: "Familie",
  color: "#2563eb",
  panel: "column" as const,
  order: 0,
  personIds: [] as Id<"users">[],
  urlEnvKey: "FAMILY_CALENDAR_URL",
  enabled: true,
  intervalMs: 300000,
};

// New sources start disabled in shadow mode, so enabling takes a second
// save; the returned id is stable across both writes.
async function createEnabledSource(
  t: CalendarTest,
  token: string,
  overrides: Partial<typeof FAMILY_SOURCE> = {},
): Promise<Id<"calendarSources">> {
  const created = await t.mutation(api.calendarSources.save, {
    token,
    source: { ...FAMILY_SOURCE, ...overrides },
  });
  const enabled = await t.mutation(api.calendarSources.save, {
    token,
    source: { ...FAMILY_SOURCE, ...overrides, enabled: true },
  });
  expect(enabled).toBe(created);
  return enabled;
}

async function getSource(
  t: CalendarTest,
  token: string,
  sourceId: Id<"calendarSources">,
) {
  const sources = await t.query(api.calendarSources.list, { token });
  const source = sources.find((entry) => entry._id === sourceId);
  if (source === undefined) {
    throw new Error("expected the calendar source to exist");
  }
  return source;
}

function eventAt(
  uid: string,
  startMs: number,
  endMs: number,
  overrides: Partial<NormalizedCalendarEvent> = {},
): NormalizedCalendarEvent {
  return {
    key: occurrenceKey(uid, overrides.recurrenceId),
    uid,
    identityQuality: "provider",
    title: `Event ${uid}`,
    startMs,
    endMs,
    allDay: false,
    timezone: "Europe/Berlin",
    ...overrides,
  };
}

function dayOffsetMs(window: CalendarWindow, days: number): number {
  return window.fromMs + days * 24 * 60 * 60 * 1000;
}

function windowOf(claimed: { window: CalendarWindow }): {
  fromDate: string;
  toDate: string;
} {
  return { fromDate: claimed.window.fromDate, toDate: claimed.window.toDate };
}

async function claimOrThrow(
  t: CalendarTest,
  sourceId: Id<"calendarSources">,
) {
  const claimed = await t.mutation(internal.calendarSync.claim, { sourceId });
  if (claimed === null) {
    throw new Error("expected the claim to succeed");
  }
  return claimed;
}

async function expireLease(
  t: CalendarTest,
  runId: Id<"calendarImports">,
  sourceId: Id<"calendarSources">,
): Promise<void> {
  const past = Date.now() - 1000;
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { leaseExpiresAt: past });
    await ctx.db.patch(sourceId, { leaseExpiresAt: past });
  });
}

async function readImport(t: CalendarTest, runId: Id<"calendarImports">) {
  const record = await t.run(async (ctx) => await ctx.db.get(runId));
  if (record === null) {
    throw new Error("expected the import run to exist");
  }
  return record;
}

async function readStagedEvents(
  t: CalendarTest,
  sourceId: Id<"calendarSources">,
  importId: Id<"calendarImports">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_source_import_key", (q) =>
        q.eq("sourceId", sourceId).eq("importId", importId),
      )
      .collect();
  });
}

describe("calendarSync.claim", () => {
  it("leasePreventsDuplicateClaim", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);

    const first = await claimOrThrow(t, sourceId);
    expect(first.sourceId).toBe(sourceId);

    // A second claim while the lease is valid gets nothing.
    const second = await t.mutation(internal.calendarSync.claim, {
      sourceId,
    });
    expect(second).toBeNull();

    const source = await getSource(t, parent.token, sourceId);
    expect(source.runningImportId).toBe(first.runId);
  });

  it("expiredClaimCannotPublishOrFail", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const claimed = await claimOrThrow(t, sourceId);
    const emptyFingerprint = contentFingerprint(windowOf(claimed), []);

    await expireLease(t, claimed.runId, sourceId);

    const published = await t.mutation(internal.calendarSync.publish, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchCount: 0,
      eventCount: 0,
      contentFingerprint: emptyFingerprint,
    });
    expect(published).toEqual({ accepted: false });

    const failed = await t.mutation(internal.calendarSync.fail, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      errorClass: "network",
    });
    expect(failed).toEqual({ accepted: false });

    // The expired run changes nothing: still current, still running, no
    // error recorded, no published stand created.
    const record = await readImport(t, claimed.runId);
    expect(record.state).toBe("running");
    expect(record.error).toBeUndefined();
    const source = await getSource(t, parent.token, sourceId);
    expect(source.runningImportId).toBe(claimed.runId);
    expect(source.publishedImportId).toBeUndefined();
    expect(source.publishedDataImportId).toBeUndefined();
  });

  it("configChangeRevokesRun", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const claimed = await claimOrThrow(t, sourceId);
    const events = [
      eventAt("a@test", dayOffsetMs(claimed.window, 1), dayOffsetMs(claimed.window, 1) + 3600000),
    ];

    const staged = await t.mutation(internal.calendarSync.stage, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchIndex: 0,
      events,
    });
    expect(staged).toEqual({ accepted: true });

    // Any config write bumps the generation and revokes the run.
    await t.mutation(api.calendarSources.save, {
      token: parent.token,
      source: { ...FAMILY_SOURCE, name: "Umbenannt", enabled: true },
    });
    const revoked = await getSource(t, parent.token, sourceId);
    expect(revoked.configGeneration).toBeGreaterThan(
      claimed.configGeneration,
    );

    const staleStage = await t.mutation(internal.calendarSync.stage, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchIndex: 1,
      events,
    });
    expect(staleStage).toEqual({ accepted: false });

    const stalePublish = await t.mutation(internal.calendarSync.publish, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchCount: 1,
      eventCount: events.length,
      contentFingerprint: contentFingerprint(windowOf(claimed), events),
    });
    expect(stalePublish).toEqual({ accepted: false });

    const refreshedPublish = await t.mutation(internal.calendarSync.publish, {
      runId: claimed.runId,
      configGeneration: revoked.configGeneration,
      batchCount: 1,
      eventCount: events.length,
      contentFingerprint: contentFingerprint(windowOf(claimed), events),
    });
    expect(refreshedPublish).toEqual({ accepted: false });

    const staleFail = await t.mutation(internal.calendarSync.fail, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      errorClass: "network",
    });
    expect(staleFail).toEqual({ accepted: false });

    // Nothing was published or rescheduled by the revoked run.
    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBeUndefined();
    expect(source.publishedDataImportId).toBeUndefined();

    // A fresh claim on the new generation succeeds and supersedes the
    // revoked run.
    const next = await claimOrThrow(t, sourceId);
    expect(next.configGeneration).toBe(revoked.configGeneration);
    const previous = await readImport(t, claimed.runId);
    expect(previous.state).toBe("superseded");
  });

  it("localConvexLocalCannotReviveOldRun", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const stale = await claimOrThrow(t, sourceId);

    // Mode flips revoke commit permission exactly like config writes.
    await t.mutation(api.calendarSources.activate, {
      token: parent.token,
      sourceId,
      mode: "local",
    });
    const events = [
      eventAt("a@test", dayOffsetMs(stale.window, 1), dayOffsetMs(stale.window, 1) + 3600000),
    ];
    const fingerprint = contentFingerprint(windowOf(stale), events);

    const stalePublish = await t.mutation(internal.calendarSync.publish, {
      runId: stale.runId,
      configGeneration: stale.configGeneration,
      batchCount: 0,
      eventCount: 0,
      contentFingerprint: fingerprint,
    });
    expect(stalePublish).toEqual({ accepted: false });
    const staleFail = await t.mutation(internal.calendarSync.fail, {
      runId: stale.runId,
      configGeneration: stale.configGeneration,
      errorClass: "network",
    });
    expect(staleFail).toEqual({ accepted: false });

    // Back to polling on a newer generation: the new run commits while the
    // old one stays dead.
    await t.mutation(api.calendarSources.activate, {
      token: parent.token,
      sourceId,
      mode: "shadow",
    });
    const current = await claimOrThrow(t, sourceId);
    expect(current.configGeneration).toBeGreaterThan(
      stale.configGeneration,
    );
    const staged = await t.mutation(internal.calendarSync.stage, {
      runId: current.runId,
      configGeneration: current.configGeneration,
      batchIndex: 0,
      events: [
        eventAt(
          "a@test",
          dayOffsetMs(current.window, 1),
          dayOffsetMs(current.window, 1) + 3600000,
        ),
      ],
    });
    expect(staged).toEqual({ accepted: true });
    const republishStale = await t.mutation(internal.calendarSync.publish, {
      runId: stale.runId,
      configGeneration: stale.configGeneration,
      batchCount: 0,
      eventCount: 0,
      contentFingerprint: fingerprint,
    });
    expect(republishStale).toEqual({ accepted: false });
  });
});

describe("calendarSync.stage", () => {
  it("stagedDataInvisibleBeforePublish", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const claimed = await claimOrThrow(t, sourceId);
    const events = [
      eventAt("a@test", dayOffsetMs(claimed.window, 1), dayOffsetMs(claimed.window, 1) + 3600000),
      eventAt("b@test", dayOffsetMs(claimed.window, 2), dayOffsetMs(claimed.window, 2) + 3600000),
    ];

    const staged = await t.mutation(internal.calendarSync.stage, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchIndex: 0,
      events,
    });
    expect(staged).toEqual({ accepted: true });

    // Staging is isolated by run id: rows exist but no success pointer
    // moves before full validation.
    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBeUndefined();
    expect(source.publishedDataImportId).toBeUndefined();
    const visible = await t.query(internal.calendarSync.activeEvents, {
      sourceId,
      fromMs: claimed.window.fromMs,
      toMs: claimed.window.toMs,
    });
    expect(visible).toEqual([]);
    const stagedRows = await readStagedEvents(t, sourceId, claimed.runId);
    expect(stagedRows).toHaveLength(2);
  });

  it("missingBatchCannotPublish", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const claimed = await claimOrThrow(t, sourceId);
    const first = eventAt(
      "a@test",
      dayOffsetMs(claimed.window, 1),
      dayOffsetMs(claimed.window, 1) + 3600000,
    );
    const second = eventAt(
      "b@test",
      dayOffsetMs(claimed.window, 2),
      dayOffsetMs(claimed.window, 2) + 3600000,
    );

    const staged = await t.mutation(internal.calendarSync.stage, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchIndex: 0,
      events: [first],
    });
    expect(staged).toEqual({ accepted: true });

    // Skipping ahead leaves a gap: the out-of-order batch is rejected.
    const gap = await t.mutation(internal.calendarSync.stage, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchIndex: 2,
      events: [second],
    });
    expect(gap).toEqual({ accepted: false });

    const published = await t.mutation(internal.calendarSync.publish, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchCount: 2,
      eventCount: 2,
      contentFingerprint: contentFingerprint(windowOf(claimed), [
        first,
        second,
      ]),
    });
    expect(published).toEqual({ accepted: false });

    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBeUndefined();
    expect(source.publishedDataImportId).toBeUndefined();
  });

  it("identicalBatchIsIdempotent", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const claimed = await claimOrThrow(t, sourceId);
    const events = [
      eventAt("a@test", dayOffsetMs(claimed.window, 1), dayOffsetMs(claimed.window, 1) + 3600000),
      eventAt("b@test", dayOffsetMs(claimed.window, 2), dayOffsetMs(claimed.window, 2) + 3600000),
    ];

    for (let round = 0; round < 2; round += 1) {
      const staged = await t.mutation(internal.calendarSync.stage, {
        runId: claimed.runId,
        configGeneration: claimed.configGeneration,
        batchIndex: 0,
        events,
      });
      expect(staged).toEqual({ accepted: true });
    }

    // Repeated identical batches do not duplicate records.
    const rows = await readStagedEvents(t, sourceId, claimed.runId);
    expect(rows).toHaveLength(2);

    const published = await t.mutation(internal.calendarSync.publish, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchCount: 1,
      eventCount: events.length,
      contentFingerprint: contentFingerprint(windowOf(claimed), events),
    });
    expect(published).toEqual({ accepted: true });
    const after = await readStagedEvents(t, sourceId, claimed.runId);
    expect(after).toHaveLength(2);
  });
});

describe("calendarSync.publish", () => {
  it("emptyCompleteImportReplacesWindow", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);

    const first = await claimOrThrow(t, sourceId);
    const kept = eventAt(
      "a@test",
      dayOffsetMs(first.window, 1),
      dayOffsetMs(first.window, 1) + 3600000,
    );
    await t.mutation(internal.calendarSync.stage, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchIndex: 0,
      events: [kept],
    });
    const publishedFirst = await t.mutation(internal.calendarSync.publish, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchCount: 1,
      eventCount: 1,
      contentFingerprint: contentFingerprint(windowOf(first), [kept]),
    });
    expect(publishedFirst).toEqual({ accepted: true });

    // A correctly empty provider response replaces the window: the new
    // (empty) generation becomes current, while the previous generation
    // stays retained under its own coverage.
    const second = await claimOrThrow(t, sourceId);
    const publishedEmpty = await t.mutation(
      internal.calendarSync.publish,
      {
        runId: second.runId,
        configGeneration: second.configGeneration,
        batchCount: 0,
        eventCount: 0,
        contentFingerprint: contentFingerprint(windowOf(second), []),
      },
    );
    expect(publishedEmpty).toEqual({ accepted: true });

    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBe(second.runId);
    expect(source.publishedDataImportId).toBe(second.runId);
    const visible = await t.query(internal.calendarSync.activeEvents, {
      sourceId,
      fromMs: second.window.fromMs,
      toMs: second.window.toMs,
    });
    expect(visible).toEqual([]);
    const previousRows = await readStagedEvents(t, sourceId, first.runId);
    expect(previousRows).toHaveLength(1);
  });

  it("failedImportKeepsPublishedGeneration", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);

    const first = await claimOrThrow(t, sourceId);
    const kept = eventAt(
      "a@test",
      dayOffsetMs(first.window, 1),
      dayOffsetMs(first.window, 1) + 3600000,
    );
    await t.mutation(internal.calendarSync.stage, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchIndex: 0,
      events: [kept],
    });
    await t.mutation(internal.calendarSync.publish, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchCount: 1,
      eventCount: 1,
      contentFingerprint: contentFingerprint(windowOf(first), [kept]),
    });

    const second = await claimOrThrow(t, sourceId);
    const replacement = eventAt(
      "b@test",
      dayOffsetMs(second.window, 2),
      dayOffsetMs(second.window, 2) + 3600000,
    );
    await t.mutation(internal.calendarSync.stage, {
      runId: second.runId,
      configGeneration: second.configGeneration,
      batchIndex: 0,
      events: [replacement],
    });
    const beforeFail = Date.now();
    const failed = await t.mutation(internal.calendarSync.fail, {
      runId: second.runId,
      configGeneration: second.configGeneration,
      errorClass: "network",
    });
    expect(failed).toEqual({ accepted: true });

    // Last-good is preserved: pointers still reference the first
    // generation and its events stay intact.
    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBe(first.runId);
    expect(source.publishedDataImportId).toBe(first.runId);
    expect(source.runningImportId).toBeUndefined();
    if (source.nextAttemptAt === undefined) {
      throw new Error("expected a rescheduled next attempt");
    }
    expect(source.nextAttemptAt).toBeGreaterThanOrEqual(beforeFail);
    expect(source.nextAttemptAt).toBeLessThan(beforeFail + 120000);
    const failure = await readImport(t, second.runId);
    expect(failure.state).toBe("error");
    if (failure.error === undefined) {
      throw new Error("expected a sanitized error message");
    }
    expect(failure.error.length).toBeGreaterThan(0);
    const keptRows = await readStagedEvents(t, sourceId, first.runId);
    expect(keptRows).toHaveLength(1);
    expect(keptRows[0]?.key).toBe(kept.key);
  });

  it("retainedOutsideCoverage", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);

    const first = await claimOrThrow(t, sourceId);
    const oldCoverage = { fromDate: "2026-09-01", toDate: "2026-10-13" };
    const carried = eventAt(
      "carried@test",
      Date.UTC(2026, 8, 15, 15, 0),
      Date.UTC(2026, 8, 15, 16, 0),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(first.runId, { ...oldCoverage });
    });
    await t.mutation(internal.calendarSync.stage, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchIndex: 0,
      events: [carried],
    });
    const publishedFirst = await t.mutation(internal.calendarSync.publish, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchCount: 1,
      eventCount: 1,
      contentFingerprint: contentFingerprint(oldCoverage, [carried]),
    });
    expect(publishedFirst).toEqual({ accepted: true });

    const second = await claimOrThrow(t, sourceId);
    const newCoverage = { fromDate: "2026-10-13", toDate: "2026-11-24" };
    const fresh = eventAt(
      "fresh@test",
      Date.UTC(2026, 9, 20, 15, 0),
      Date.UTC(2026, 9, 20, 16, 0),
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(second.runId, { ...newCoverage });
    });
    await t.mutation(internal.calendarSync.stage, {
      runId: second.runId,
      configGeneration: second.configGeneration,
      batchIndex: 0,
      events: [fresh],
    });
    const publishedSecond = await t.mutation(internal.calendarSync.publish, {
      runId: second.runId,
      configGeneration: second.configGeneration,
      batchCount: 1,
      eventCount: 1,
      contentFingerprint: contentFingerprint(newCoverage, [fresh]),
    });
    expect(publishedSecond).toEqual({ accepted: true });

    // Out-of-window data stays stored under its previous coverage but never
    // becomes falsely current: the feed window sees only the new event.
    const previousRows = await readStagedEvents(t, sourceId, first.runId);
    expect(previousRows).toHaveLength(1);
    const visible = await t.query(internal.calendarSync.activeEvents, {
      sourceId,
      fromMs: Date.UTC(2026, 9, 13),
      toMs: Date.UTC(2026, 10, 24),
    });
    expect(visible.map((entry) => entry.key)).toEqual([fresh.key]);
    const outside = await t.query(internal.calendarSync.activeEvents, {
      sourceId,
      fromMs: Date.UTC(2026, 8, 1),
      toMs: Date.UTC(2026, 8, 30),
    });
    expect(outside).toEqual([]);
  });

  it("cleanupCannotDeleteActiveGeneration", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);
    const claimed = await claimOrThrow(t, sourceId);
    const events = [
      eventAt("a@test", dayOffsetMs(claimed.window, 1), dayOffsetMs(claimed.window, 1) + 3600000),
    ];
    await t.mutation(internal.calendarSync.stage, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchIndex: 0,
      events,
    });
    await t.mutation(internal.calendarSync.publish, {
      runId: claimed.runId,
      configGeneration: claimed.configGeneration,
      batchCount: 1,
      eventCount: events.length,
      contentFingerprint: contentFingerprint(windowOf(claimed), events),
    });

    const cleaned = await t.mutation(internal.calendarSync.cleanup, {
      sourceId,
    });
    expect(cleaned.deleted).toBe(0);
    expect(cleaned.remaining).toBe(false);

    const record = await readImport(t, claimed.runId);
    expect(record.state).toBe("ready");
    const rows = await readStagedEvents(t, sourceId, claimed.runId);
    expect(rows).toHaveLength(1);
    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedDataImportId).toBe(claimed.runId);
  });

  it("unchangedSuccessReusesEventsAndAdvancesFreshness", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);

    const first = await claimOrThrow(t, sourceId);
    const events = [
      eventAt("a@test", dayOffsetMs(first.window, 1), dayOffsetMs(first.window, 1) + 3600000),
      eventAt("b@test", dayOffsetMs(first.window, 2), dayOffsetMs(first.window, 2) + 3600000),
    ];
    const fingerprint = contentFingerprint(windowOf(first), events);
    await t.mutation(internal.calendarSync.stage, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchIndex: 0,
      events,
    });
    await t.mutation(internal.calendarSync.publish, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchCount: 1,
      eventCount: events.length,
      contentFingerprint: fingerprint,
    });
    const publishedFirst = await readImport(t, first.runId);

    // An unchanged fetch publishes fresh success metadata while reusing
    // the existing data pointer (no events are rewritten).
    const second = await claimOrThrow(t, sourceId);
    expect(second.previousFingerprint).toBe(fingerprint);
    const unchanged = await t.mutation(
      internal.calendarSync.publishUnchanged,
      {
        runId: second.runId,
        configGeneration: second.configGeneration,
        contentFingerprint: fingerprint,
      },
    );
    expect(unchanged).toEqual({ accepted: true });

    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBe(second.runId);
    expect(source.publishedDataImportId).toBe(first.runId);
    const publishedSecond = await readImport(t, second.runId);
    expect(publishedSecond.state).toBe("ready");
    if (
      publishedFirst.successAt === undefined ||
      publishedSecond.successAt === undefined
    ) {
      throw new Error("expected success timestamps on both generations");
    }
    expect(publishedSecond.successAt).toBeGreaterThanOrEqual(
      publishedFirst.successAt,
    );
    const stored = await t.run(async (ctx) => {
      return await ctx.db
        .query("calendarEvents")
        .withIndex("by_source_import_key", (q) => q.eq("sourceId", sourceId))
        .collect();
    });
    expect(stored).toHaveLength(2);
    expect(
      calendarFreshness(
        publishedSecond.successAt,
        FAMILY_SOURCE.intervalMs,
        Date.now(),
      ),
    ).toBe("fresh");
  });

  it("changedWindowCannotUseUnchangedPublish", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createEnabledSource(t, parent.token);

    const first = await claimOrThrow(t, sourceId);
    const events = [
      eventAt("a@test", dayOffsetMs(first.window, 1), dayOffsetMs(first.window, 1) + 3600000),
    ];
    const fingerprint = contentFingerprint(windowOf(first), events);
    await t.mutation(internal.calendarSync.stage, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchIndex: 0,
      events,
    });
    await t.mutation(internal.calendarSync.publish, {
      runId: first.runId,
      configGeneration: first.configGeneration,
      batchCount: 1,
      eventCount: events.length,
      contentFingerprint: fingerprint,
    });

    // Same fingerprint but a moved window is a different stand: the
    // unchanged fast path must refuse.
    const second = await claimOrThrow(t, sourceId);
    await t.run(async (ctx) => {
      await ctx.db.patch(second.runId, {
        fromDate: "2026-10-13",
        toDate: "2026-11-24",
      });
    });
    const moved = await t.mutation(internal.calendarSync.publishUnchanged, {
      runId: second.runId,
      configGeneration: second.configGeneration,
      contentFingerprint: fingerprint,
    });
    expect(moved).toEqual({ accepted: false });

    // Same window but a different fingerprint is a changed stand as well.
    await t.run(async (ctx) => {
      await ctx.db.patch(second.runId, {
        fromDate: first.window.fromDate,
        toDate: first.window.toDate,
      });
    });
    const changed = await t.mutation(internal.calendarSync.publishUnchanged, {
      runId: second.runId,
      configGeneration: second.configGeneration,
      contentFingerprint: contentFingerprint(windowOf(first), []),
    });
    expect(changed).toEqual({ accepted: false });

    const source = await getSource(t, parent.token, sourceId);
    expect(source.publishedImportId).toBe(first.runId);
    expect(source.publishedDataImportId).toBe(first.runId);
    const record = await readImport(t, second.runId);
    expect(record.state).not.toBe("ready");
  });
});
