import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import { calendarWindow, occurrenceKey } from "../../convex/lib/calendarPolicy.js";
import {
  createChildSession,
  createParentSession,
  setupCalendarTest,
} from "./setup.js";

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

async function saveFamilySource(
  t: ReturnType<typeof setupCalendarTest>,
  token: string,
  overrides: Partial<typeof FAMILY_SOURCE> = {},
) {
  return await t.mutation(api.calendarSources.save, {
    token,
    source: { ...FAMILY_SOURCE, ...overrides },
  });
}

async function insertReadyImport(
  t: ReturnType<typeof setupCalendarTest>,
  sourceId: Id<"calendarSources">,
  configGeneration: number,
  now: number,
): Promise<Id<"calendarImports">> {
  const window = calendarWindow(now);
  return await t.run(async (ctx) => {
    return await ctx.db.insert("calendarImports", {
      sourceId,
      sequence: 1,
      configGeneration,
      fromDate: window.fromDate,
      toDate: window.toDate,
      state: "ready",
      startedAt: now,
      successAt: now,
    });
  });
}

describe("calendarSources.save", () => {
  it("renameKeepsSourceId (rename and reorder keep the stable document)", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    const first = await saveFamilySource(t, parent.token);
    const renamed = await saveFamilySource(t, parent.token, {
      name: "Familienkalender",
      order: 2,
    });

    // Fixed IDs survive rename and reorder.
    expect(renamed).toBe(first);
    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?._id).toBe(first);
    expect(sources[0]?.name).toBe("Familienkalender");
    expect(sources[0]?.order).toBe(2);
  });

  it("creates new sources disabled in shadow mode", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    // The input asks for enabled, but new sources always start disabled in
    // shadow mode for comparison before activation.
    await saveFamilySource(t, parent.token, { enabled: true });
    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources[0]?.enabled).toBe(false);
    expect(sources[0]?.mode).toBe("shadow");
  });

  it("lists sources by order then sourceKey", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    await saveFamilySource(t, parent.token, {
      sourceKey: "b-second",
      name: "B",
      urlEnvKey: "B_URL",
      order: 1,
    });
    await saveFamilySource(t, parent.token, {
      sourceKey: "a-second",
      name: "A",
      urlEnvKey: "A_URL",
      order: 1,
    });
    await saveFamilySource(t, parent.token, {
      sourceKey: "family",
      name: "Familie",
      order: 0,
    });

    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources.map((s) => s.sourceKey)).toEqual([
      "family",
      "a-second",
      "b-second",
    ]);
  });

  it("rejects chained column targets", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    const column = await saveFamilySource(t, parent.token);
    const school = await saveFamilySource(t, parent.token, {
      sourceKey: "schule",
      name: "Schule",
      panel: "school",
      urlEnvKey: "SCHOOL_CALENDAR_URL",
      intoCalendarId: column,
    });
    expect(school).toBeDefined();

    // A column target with its own target chains: rejected.
    await expect(
      saveFamilySource(t, parent.token, {
        sourceKey: "extra",
        name: "Extra",
        panel: "school",
        urlEnvKey: "EXTRA_CALENDAR_URL",
        intoCalendarId: school,
      }),
    ).rejects.toThrow(/chain/i);

    // Self reference: rejected.
    const extra = await saveFamilySource(t, parent.token, {
      sourceKey: "extra",
      name: "Extra",
      urlEnvKey: "EXTRA_CALENDAR_URL",
    });
    await expect(
      saveFamilySource(t, parent.token, {
        sourceKey: "extra",
        name: "Extra",
        urlEnvKey: "EXTRA_CALENDAR_URL",
        intoCalendarId: extra,
      }),
    ).rejects.toThrow(/cycle|itself/i);
  });
});

describe("calendarSources.bindPerson", () => {
  it("rejectDuplicateBinding", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const child = await createChildSession(t);

    const bindingId = await t.mutation(api.calendarSources.bindPerson, {
      token: parent.token,
      userId: child.userId,
      kind: "timetable",
      externalId: "timetable-7b",
    });
    expect(bindingId).toBeDefined();

    await expect(
      t.mutation(api.calendarSources.bindPerson, {
        token: parent.token,
        userId: child.userId,
        kind: "timetable",
        externalId: "timetable-7b",
      }),
    ).rejects.toThrow(/duplicate/i);

    // A different external account for the same child is a separate binding.
    const second = await t.mutation(api.calendarSources.bindPerson, {
      token: parent.token,
      userId: child.userId,
      kind: "besteschule",
      externalId: "student-42",
    });
    expect(second).not.toBe(bindingId);
  });
});

describe("calendarSources auth", () => {
  it("childCannotConfigure", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const child = await createChildSession(t);
    const sourceId = await saveFamilySource(t, parent.token);

    await expect(
      t.query(api.calendarSources.list, { token: child.token }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.calendarSources.save, {
        token: child.token,
        source: FAMILY_SOURCE,
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.calendarSources.bindPerson, {
        token: child.token,
        userId: child.userId,
        kind: "timetable",
        externalId: "timetable-7b",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.calendarSources.activate, {
        token: child.token,
        sourceId,
        mode: "convex",
      }),
    ).rejects.toThrow(/parent/i);
  });
});

describe("calendarSources.activate", () => {
  it("activationNeedsCurrentCompleteImport", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await saveFamilySource(t, parent.token);

    // No import yet: activation to "convex" is rejected.
    await expect(
      t.mutation(api.calendarSources.activate, {
        token: parent.token,
        sourceId,
        mode: "convex",
      }),
    ).rejects.toThrow(/import/i);

    // A successful current-generation import covering the current 42-day
    // window unlocks activation.
    const now = Date.now();
    await insertReadyImport(t, sourceId, 1, now);
    const result = await t.mutation(api.calendarSources.activate, {
      token: parent.token,
      sourceId,
      mode: "convex",
    });
    expect(result.configurationRevision).toBeGreaterThan(1);

    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources[0]?.mode).toBe("convex");
    expect(sources[0]?.enabled).toBe(true);
  });

  it("old config invalidated (config change revokes the previous import)", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await saveFamilySource(t, parent.token);

    await insertReadyImport(t, sourceId, 1, Date.now());
    // A config change (rename) bumps the generation: the previous import no
    // longer qualifies for activation.
    await saveFamilySource(t, parent.token, { name: "Umbenannt" });
    await expect(
      t.mutation(api.calendarSources.activate, {
        token: parent.token,
        sourceId,
        mode: "convex",
      }),
    ).rejects.toThrow(/import/i);
  });
});

describe("calendarEvents identity", () => {
  it("sameKeyDifferentCalendarsRemainDistinct", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const first = await saveFamilySource(t, parent.token);
    const second = await saveFamilySource(t, parent.token, {
      sourceKey: "schule",
      name: "Schule",
      urlEnvKey: "SCHOOL_CALENDAR_URL",
    });

    // Same ICS UID in two different calendars: two distinct stored events.
    const now = Date.now();
    const startMs = Date.UTC(2026, 9, 10, 17, 0);
    await t.run(async (ctx) => {
      for (const sourceId of [first, second]) {
        const importId = await ctx.db.insert("calendarImports", {
          sourceId,
          sequence: 1,
          configGeneration: 1,
          fromDate: "2026-09-30",
          toDate: "2026-11-11",
          state: "ready",
          startedAt: now,
          successAt: now,
        });
        await ctx.db.insert("calendarEvents", {
          sourceId,
          importId,
          key: occurrenceKey("shared-uid@example.test", undefined),
          uid: "shared-uid@example.test",
          identityQuality: "provider",
          title: "Elternabend",
          startMs,
          endMs: startMs + 60 * 60 * 1000,
          allDay: false,
          timezone: "Europe/Berlin",
        });
      }
    });

    for (const sourceId of [first, second]) {
      const events = await t.run(async (ctx) => {
        return await ctx.db
          .query("calendarEvents")
          .withIndex("by_source_import_key", (q) => q.eq("sourceId", sourceId))
          .collect();
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceId).toBe(sourceId);
    }
  });
});
