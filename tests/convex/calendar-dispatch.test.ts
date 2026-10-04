// Dispatcher and manual refresh for central calendar sync (Task 4).
//
// These DB tests pin the scheduling contract before it exists (TDD RED
// phase): dispatch() schedules only due enabled central sources through the
// scheduler, reserves their next slot and advances the stored Berlin day
// without touching import coverage. Manual refresh is parent-only,
// throttled to one attempt per minute and never double-starts a valid
// running import. Scheduled Node actions are never executed here: tests
// assert the mutation return plus DB state, and drive claim() directly to
// model an action that ran.
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import { contentFingerprint } from "../../convex/lib/calendarFingerprint.js";
import { todayBerlin } from "../../convex/lib/dates.js";
import {
  createChildSession,
  createParentSession,
  setupCalendarTest,
} from "./setup.js";

type CalendarTest = ReturnType<typeof setupCalendarTest>;

const BASE_SOURCE = {
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

async function sourceById(
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

// Save twice (new sources start disabled/shadow), publish a ready import
// for the current generation and activate central mode.
async function createConvexSource(
  t: CalendarTest,
  token: string,
  overrides: Partial<typeof BASE_SOURCE> = {},
): Promise<Id<"calendarSources">> {
  const created = await t.mutation(api.calendarSources.save, {
    token,
    source: { ...BASE_SOURCE, ...overrides },
  });
  const enabled = await t.mutation(api.calendarSources.save, {
    token,
    source: { ...BASE_SOURCE, ...overrides, enabled: true },
  });
  expect(enabled).toBe(created);
  const claimed = await t.mutation(internal.calendarSync.claim, {
    sourceId: enabled,
  });
  if (claimed === null) {
    throw new Error("expected the claim to succeed");
  }
  await t.mutation(internal.calendarSync.stage, {
    runId: claimed.runId,
    configGeneration: claimed.configGeneration,
    batchIndex: 0,
    events: [],
  });
  const fingerprint = contentFingerprint(
    { fromDate: claimed.window.fromDate, toDate: claimed.window.toDate },
    [],
  );
  const published = await t.mutation(internal.calendarSync.publish, {
    runId: claimed.runId,
    configGeneration: claimed.configGeneration,
    batchCount: 1,
    eventCount: 0,
    contentFingerprint: fingerprint,
  });
  expect(published.accepted).toBe(true);
  await t.mutation(api.calendarSources.activate, {
    token,
    sourceId: enabled,
    mode: "convex",
  });
  return enabled;
}

async function patchNextAttempt(
  t: CalendarTest,
  sourceId: Id<"calendarSources">,
  nextAttemptAt: number | undefined,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch(sourceId, { nextAttemptAt });
  });
}

async function importCount(t: CalendarTest): Promise<number> {
  return await t.run(async (ctx) => {
    return (await ctx.db.query("calendarImports").collect()).length;
  });
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

describe("calendarSync.dispatch", () => {
  it("dispatchSchedulesOnlyDueEnabledCentralSources", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await t.mutation(api.calendarSources.setConfigured, {
      token: parent.token,
      configured: true,
    });
    const now = Date.now();

    const due = await createConvexSource(t, parent.token, {
      sourceKey: "due",
      order: 0,
    });
    await patchNextAttempt(t, due, now - 1000);

    const future = await createConvexSource(t, parent.token, {
      sourceKey: "future",
      order: 1,
    });
    await patchNextAttempt(t, future, now + 3600000);

    const shadow = await t.mutation(api.calendarSources.save, {
      token: parent.token,
      source: { ...BASE_SOURCE, sourceKey: "shadow", order: 2 },
    });
    await t.mutation(api.calendarSources.save, {
      token: parent.token,
      source: { ...BASE_SOURCE, sourceKey: "shadow", order: 2, enabled: true },
    });

    const local = await createConvexSource(t, parent.token, {
      sourceKey: "local",
      order: 3,
    });
    await t.mutation(api.calendarSources.activate, {
      token: parent.token,
      sourceId: local,
      mode: "local",
    });

    await createConvexSource(t, parent.token, {
      sourceKey: "disabled",
      order: 4,
    });
    await t.mutation(api.calendarSources.save, {
      token: parent.token,
      source: { ...BASE_SOURCE, sourceKey: "disabled", order: 4, enabled: false },
    });

    const before = await importCount(t);
    const result = await t.mutation(internal.calendarSync.dispatch, {});
    expect(result.scheduled).toEqual([due]);
    expect(result.berlinDate).toBe(todayBerlin(Date.now()));
    // The due slot is reserved so the next minute tick skips it; the Node
    // action itself never runs inside this edge-runtime test.
    const reserved = await sourceById(t, parent.token, due);
    expect(reserved.nextAttemptAt ?? 0).toBeGreaterThan(now);
    expect(await importCount(t)).toBe(before);
    expect(shadow).not.toBe(due);
  });

  it("midnightAdvancesWindowWithoutProviderSuccess", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await t.mutation(api.calendarSources.setConfigured, {
      token: parent.token,
      configured: true,
    });
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("familyBackendSettings")
        .withIndex("by_key", (q) => q.eq("key", "calendars"))
        .unique();
      if (settings === null) {
        throw new Error("expected calendar settings to exist");
      }
      await ctx.db.patch(settings._id, { berlinDate: "2000-01-01" });
    });
    const result = await t.mutation(internal.calendarSync.dispatch, {});
    expect(result.scheduled).toEqual([]);
    expect(result.berlinDate).toBe(todayBerlin(Date.now()));
    expect(await importCount(t)).toBe(0);
  });

  it("importedCoverageDoesNotAdvanceWithoutFetch", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await t.mutation(api.calendarSources.setConfigured, {
      token: parent.token,
      configured: true,
    });
    const sourceId = await createConvexSource(t, parent.token);
    const before = await t.run(async (ctx) => {
      const source = await ctx.db.get(sourceId);
      const dataImportId = source?.publishedDataImportId;
      if (dataImportId === undefined) {
        throw new Error("expected published data");
      }
      const dataImport = await ctx.db.get(dataImportId);
      return {
        fromDate: dataImport?.fromDate,
        toDate: dataImport?.toDate,
        fingerprint: dataImport?.contentFingerprint,
      };
    });
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("familyBackendSettings")
        .withIndex("by_key", (q) => q.eq("key", "calendars"))
        .unique();
      if (settings === null) {
        throw new Error("expected calendar settings to exist");
      }
      await ctx.db.patch(settings._id, { berlinDate: "2000-01-01" });
    });
    await t.mutation(internal.calendarSync.dispatch, {});
    const after = await t.run(async (ctx) => {
      const source = await ctx.db.get(sourceId);
      const dataImportId = source?.publishedDataImportId;
      if (dataImportId === undefined) {
        throw new Error("expected published data");
      }
      const dataImport = await ctx.db.get(dataImportId);
      const settings = await ctx.db
        .query("familyBackendSettings")
        .withIndex("by_key", (q) => q.eq("key", "calendars"))
        .unique();
      return {
        fromDate: dataImport?.fromDate,
        toDate: dataImport?.toDate,
        fingerprint: dataImport?.contentFingerprint,
        berlinDate: settings?.berlinDate,
      };
    });
    // The stored Berlin day moves on; the published coverage only moves
    // when a later fetch publishes a new generation.
    expect(after.berlinDate).toBe(todayBerlin(Date.now()));
    expect(after.fromDate).toBe(before.fromDate);
    expect(after.toDate).toBe(before.toDate);
    expect(after.fingerprint).toBe(before.fingerprint);
  });
});

describe("calendarSources.requestRefresh", () => {
  it("manualRefreshIsThrottled (running, then throttled, then started)", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await createConvexSource(t, parent.token);

    const claimed = await t.mutation(internal.calendarSync.claim, {
      sourceId,
    });
    if (claimed === null) {
      throw new Error("expected the claim to succeed");
    }
    // A valid running import is never double-started.
    await expect(
      t.mutation(api.calendarSources.requestRefresh, {
        token: parent.token,
        sourceId,
      }),
    ).resolves.toEqual({ started: false, reason: "running" });

    // An expired lease with a recent attempt stays throttled.
    await expireLease(t, claimed.runId, sourceId);
    await expect(
      t.mutation(api.calendarSources.requestRefresh, {
        token: parent.token,
        sourceId,
      }),
    ).resolves.toEqual({ started: false, reason: "throttled" });

    // An older attempt may start again (the scheduler queues the action;
    // the Node fetch itself never runs in this edge-runtime test).
    await t.run(async (ctx) => {
      const latest = (
        await ctx.db
          .query("calendarImports")
          .withIndex("by_source_sequence", (q) => q.eq("sourceId", sourceId))
          .collect()
      ).sort((a, b) => b.sequence - a.sequence)[0];
      await ctx.db.patch(latest._id, { startedAt: Date.now() - 120000 });
    });
    await expect(
      t.mutation(api.calendarSources.requestRefresh, {
        token: parent.token,
        sourceId,
      }),
    ).resolves.toEqual({ started: true, reason: null });
  });

  it("requestRefreshIsParentOnlyAndCentralOnly", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const child = await createChildSession(t);
    const sourceId = await createConvexSource(t, parent.token);

    await expect(
      t.mutation(api.calendarSources.requestRefresh, {
        token: child.token,
        sourceId,
      }),
    ).rejects.toThrow();

    const shadowId = await t.mutation(api.calendarSources.save, {
      token: parent.token,
      source: { ...BASE_SOURCE, sourceKey: "shadow", order: 9 },
    });
    await expect(
      t.mutation(api.calendarSources.requestRefresh, {
        token: parent.token,
        sourceId: shadowId,
      }),
    ).resolves.toEqual({ started: false, reason: null });
  });
});
