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
  kind: "ics" as const,
  url: "https://example.test/family.ics",
  color: "#2563eb",
  sortOrder: 0,
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

async function insertCommittedImport(
  t: ReturnType<typeof setupCalendarTest>,
  sourceId: Id<"calendarSources">,
  generation: number,
  now: number,
) {
  const window = calendarWindow(now);
  await t.run(async (ctx) => {
    await ctx.db.insert("calendarImports", {
      sourceId,
      generation,
      windowStart: window.startDate,
      windowEnd: window.endDate,
      status: "committed",
      startedAt: now,
      completedAt: now,
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
      sortOrder: 2,
    });

    // Fixed IDs survive rename and reorder.
    expect(renamed).toBe(first);
    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?._id).toBe(first);
    expect(sources[0]?.name).toBe("Familienkalender");
    expect(sources[0]?.sortOrder).toBe(2);
  });

  it("creates new sources disabled in shadow mode", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    await saveFamilySource(t, parent.token);
    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources[0]?.enabled).toBe(false);
    expect(sources[0]?.mode).toBe("shadow");
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
      kind: "calendar",
      externalId: "family-calendar",
    });
    expect(bindingId).toBeDefined();

    await expect(
      t.mutation(api.calendarSources.bindPerson, {
        token: parent.token,
        userId: child.userId,
        kind: "calendar",
        externalId: "family-calendar",
      }),
    ).rejects.toThrow(/duplicate/i);

    // A different external account for the same child is a separate binding.
    const second = await t.mutation(api.calendarSources.bindPerson, {
      token: parent.token,
      userId: child.userId,
      kind: "calendar",
      externalId: "schule-kalender",
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
        kind: "calendar",
        externalId: "family-calendar",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.calendarSources.activate, {
        token: child.token,
        sourceId,
        mode: "active",
      }),
    ).rejects.toThrow(/parent/i);
  });
});

describe("calendarSources.activate", () => {
  it("activationNeedsCurrentCompleteImport", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await saveFamilySource(t, parent.token);

    // No import yet: activation to "active" is rejected.
    await expect(
      t.mutation(api.calendarSources.activate, {
        token: parent.token,
        sourceId,
        mode: "active",
      }),
    ).rejects.toThrow(/import/i);

    // A successful current-generation import covering the current 42-day
    // window unlocks activation.
    const now = Date.now();
    await insertCommittedImport(t, sourceId, 1, now);
    const result = await t.mutation(api.calendarSources.activate, {
      token: parent.token,
      sourceId,
      mode: "active",
    });
    expect(result.configurationRevision).toBeGreaterThan(1);

    const sources = await t.query(api.calendarSources.list, {
      token: parent.token,
    });
    expect(sources[0]?.mode).toBe("active");
    expect(sources[0]?.enabled).toBe(true);
  });

  it("old config invalidated (config change revokes the previous import)", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const sourceId = await saveFamilySource(t, parent.token);

    await insertCommittedImport(t, sourceId, 1, Date.now());
    // A config change (rename) bumps the generation: the previous import no
    // longer qualifies for activation.
    await saveFamilySource(t, parent.token, { name: "Umbenannt" });
    await expect(
      t.mutation(api.calendarSources.activate, {
        token: parent.token,
        sourceId,
        mode: "active",
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
      url: "https://example.test/schule.ics",
    });

    // Same ICS UID in two different calendars: two distinct stored events.
    await t.run(async (ctx) => {
      for (const sourceId of [first, second]) {
        await ctx.db.insert("calendarEvents", {
          sourceId,
          uid: "shared-uid@example.test",
          occurrenceKey: occurrenceKey("shared-uid@example.test", undefined),
          title: "Elternabend",
          start: "2026-10-10T19:00:00+02:00",
          allDay: false,
        });
      }
    });

    for (const sourceId of [first, second]) {
      const events = await t.run(async (ctx) => {
        return await ctx.db
          .query("calendarEvents")
          .withIndex("by_source", (q) => q.eq("sourceId", sourceId))
          .collect();
      });
      expect(events).toHaveLength(1);
      expect(events[0]?.sourceId).toBe(sourceId);
    }
  });
});
