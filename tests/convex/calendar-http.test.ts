// Protected calendar feed: HTTP route plus role-scoped user queries
// (Task 4). These tests pin the read contract before it exists (TDD RED
// phase): GET /dashboard/calendars accepts only the calendar-only device
// token (401 otherwise, calendar token never ingests), serves the last
// published stand with per-source age, answers 503 while unconfigured or
// oversized, omits shadow data and every secret, and distinguishes an
// explicitly empty configuration from a missing one. forUser() exposes to
// children only explicitly assigned personal calendars while parents keep
// the family stand (minus calendars assigned to a child).
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import { contentFingerprint } from "../../convex/lib/calendarFingerprint.js";
import { occurrenceKey } from "../../convex/lib/calendarPolicy.js";
import type { NormalizedCalendarEvent } from "../../convex/lib/calendarTypes.js";
import {
  createChildSession,
  createParentSession,
  setupCalendarTest,
} from "./setup.js";

type CalendarTest = ReturnType<typeof setupCalendarTest>;

const CALENDAR_TOKEN = "test-calendar-device-token";

function stubCalendarEnv(extra: Record<string, string> = {}): void {
  vi.stubEnv("CALENDAR_DASHBOARD_TOKEN", CALENDAR_TOKEN);
  vi.stubEnv("DASHBOARD_TOKEN", "test-dashboard-token");
  vi.stubEnv("INGEST_TOKEN", "test-ingest-token");
  for (const [key, value] of Object.entries(extra)) {
    vi.stubEnv(key, value);
  }
}

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

function eventAt(
  uid: string,
  startMs: number,
  endMs: number,
): NormalizedCalendarEvent {
  return {
    key: occurrenceKey(uid, undefined),
    uid,
    identityQuality: "provider",
    title: `Event ${uid}`,
    startMs,
    endMs,
    allDay: false,
    timezone: "Europe/Berlin",
  };
}

// Publish a real import through the generation-guarded protocol, then
// activate central mode. Returns the published window.
async function publishCentralSource(
  t: CalendarTest,
  token: string,
  source: typeof BASE_SOURCE,
  events: NormalizedCalendarEvent[],
): Promise<{ sourceId: Id<"calendarSources">; fromDate: string; toDate: string }> {
  const created = await t.mutation(api.calendarSources.save, {
    token,
    source,
  });
  const enabled = await t.mutation(api.calendarSources.save, {
    token,
    source: { ...source, enabled: true },
  });
  expect(enabled).toBe(created);
  const claimed = await t.mutation(internal.calendarSync.claim, {
    sourceId: enabled,
  });
  if (claimed === null) {
    throw new Error("expected the claim to succeed");
  }
  const startMs = claimed.window.fromMs;
  const placed = events.map((event, index) => ({
    ...event,
    startMs: startMs + (index + 1) * 3600000,
    endMs: startMs + (index + 1) * 3600000 + 1800000,
  }));
  await t.mutation(internal.calendarSync.stage, {
    runId: claimed.runId,
    configGeneration: claimed.configGeneration,
    batchIndex: 0,
    events: placed,
  });
  const fingerprint = contentFingerprint(
    { fromDate: claimed.window.fromDate, toDate: claimed.window.toDate },
    placed,
  );
  const published = await t.mutation(internal.calendarSync.publish, {
    runId: claimed.runId,
    configGeneration: claimed.configGeneration,
    batchCount: 1,
    eventCount: placed.length,
    contentFingerprint: fingerprint,
  });
  expect(published.accepted).toBe(true);
  await t.mutation(api.calendarSources.activate, {
    token,
    sourceId: enabled,
    mode: "convex",
  });
  return {
    sourceId: enabled,
    fromDate: claimed.window.fromDate,
    toDate: claimed.window.toDate,
  };
}

// A family calendar plus one calendar explicitly assigned to the child,
// both with published events, plus a shadow calendar whose published rows
// must never reach the feed.
async function seedConfiguredFeed(t: CalendarTest): Promise<{
  parentToken: string;
  childToken: string;
  strangerToken: string;
}> {
  const parent = await createParentSession(t);
  const child = await createChildSession(t);
  const stranger = await createChildSession(t);
  await t.mutation(api.calendarSources.setConfigured, {
    token: parent.token,
    configured: true,
  });
  await publishCentralSource(t, parent.token, BASE_SOURCE, [
    eventAt("family-1", 0, 1),
    eventAt("family-2", 0, 1),
  ]);
  const family = await t.run(async (ctx) => {
    return await ctx.db
      .query("calendarSources")
      .withIndex("by_sourceKey", (q) => q.eq("sourceKey", "family"))
      .unique();
  });
  if (family === null) {
    throw new Error("expected the family source to exist");
  }
  await publishCentralSource(
    t,
    parent.token,
    {
      ...BASE_SOURCE,
      sourceKey: "school",
      name: "Schule",
      color: "#16a34a",
      panel: "school",
      order: 1,
      personIds: [child.userId],
      urlEnvKey: "SCHOOL_CALENDAR_URL",
    },
    [eventAt("school-1", 0, 1)],
  );
  await t.mutation(api.calendarSources.save, {
    token: parent.token,
    source: {
      ...BASE_SOURCE,
      sourceKey: "school",
      name: "Schule",
      color: "#16a34a",
      panel: "school",
      order: 1,
      intoCalendarId: family._id,
      personIds: [child.userId],
      urlEnvKey: "SCHOOL_CALENDAR_URL",
      enabled: true,
      intervalMs: 300000,
    },
  });
  // Shadow stand with published rows: parent-only, never in the feed.
  const shadowCreated = await t.mutation(api.calendarSources.save, {
    token: parent.token,
    source: { ...BASE_SOURCE, sourceKey: "shadow", order: 2 },
  });
  const shadowEnabled = await t.mutation(api.calendarSources.save, {
    token: parent.token,
    source: { ...BASE_SOURCE, sourceKey: "shadow", order: 2, enabled: true },
  });
  expect(shadowEnabled).toBe(shadowCreated);
  await t.run(async (ctx) => {
    const source = await ctx.db.get(shadowCreated);
    if (source === null) {
      throw new Error("expected the shadow source to exist");
    }
    const now = Date.now();
    const importId = await ctx.db.insert("calendarImports", {
      sourceId: shadowCreated,
      sequence: 1,
      configGeneration: source.configGeneration,
      state: "ready",
      fromDate: "2026-10-03",
      toDate: "2026-11-14",
      startedAt: now,
      successAt: now,
      eventCount: 1,
      batchCount: 1,
      batchTotal: 1,
      contentFingerprint: "shadow-stand",
    });
    await ctx.db.insert("calendarEvents", {
      ...eventAt("shadow-1", now, now + 3600000),
      sourceId: shadowCreated,
      importId,
    });
    await ctx.db.patch(shadowCreated, {
      publishedImportId: importId,
      publishedDataImportId: importId,
    });
  });
  return {
    parentToken: parent.token,
    childToken: child.token,
    strangerToken: stranger.token,
  };
}

async function getCalendars(
  t: CalendarTest,
  path = "/dashboard/calendars",
  headers: Record<string, string> = {},
): Promise<Response> {
  return await t.fetch(path, { headers });
}

describe("GET /dashboard/calendars", () => {
  it("rejectsMissingForeignAndLegacyTokens (401, calendar token never ingests)", async () => {
    stubCalendarEnv();
    try {
      const t = setupCalendarTest();
      await seedConfiguredFeed(t);
      const deny = [401];
      expect(
        (await getCalendars(t, "/dashboard/calendars")).status,
      ).toEqual(deny[0]);
      expect(
        (
          await getCalendars(t, "/dashboard/calendars", {
            Authorization: "Bearer wrong-token",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await getCalendars(t, "/dashboard/calendars", {
            Authorization: "Bearer test-dashboard-token",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await getCalendars(t, "/dashboard/calendars", {
            Authorization: "Bearer test-ingest-token",
          })
        ).status,
      ).toBe(401);
      // The calendar device token authorizes the feed but no ingest route.
      expect(
        (
          await getCalendars(t, "/dashboard/calendars", {
            Authorization: `Bearer ${CALENDAR_TOKEN}`,
          })
        ).status,
      ).toBe(200);
      const ingest = await t.fetch("/ingest/child", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CALENDAR_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ childSlug: "x", days: [] }),
      });
      expect(ingest.status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("servesThePublishedStand (sorted, aged, secret-free, no-store)", async () => {
    stubCalendarEnv();
    try {
      const t = setupCalendarTest();
      await seedConfiguredFeed(t);
      const response = await getCalendars(t, "/dashboard/calendars", {
        Authorization: `Bearer ${CALENDAR_TOKEN}`,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const feed = (await response.json()) as Record<string, unknown>;
      expect(feed["version"]).toBe(1);
      expect(feed["scope"]).toBe("family-calendars");
      expect(feed["timezone"]).toBe("Europe/Berlin");
      // Same contract shape as tests/fixtures/calendar-feed-v1.json (Task 5).
      expect(Object.keys(feed).sort()).toEqual(
        [
          "bindings",
          "calendars",
          "configurationRevision",
          "events",
          "generatedAt",
          "people",
          "scope",
          "timezone",
          "version",
          "window",
        ].sort(),
      );
      const calendars = feed["calendars"] as Array<Record<string, unknown>>;
      // Shadow data excluded; central calendars sorted by order, then key.
      expect(calendars.map((calendar) => calendar["sourceKey"])).toEqual([
        "family",
        "school",
      ]);
      const events = feed["events"] as Array<Record<string, unknown>>;
      expect(events).toHaveLength(3);
      // Per-source age comes from the published generation, generatedAt is now.
      for (const calendar of calendars) {
        expect(typeof calendar["lastSuccessAt"]).toBe("number");
        expect(calendar["freshness"]).toBe("fresh");
        expect(calendar["lastAttemptStatus"]).toBe("success");
        expect(calendar["coverage"]).toBeDefined();
      }
      expect(Math.abs((feed["generatedAt"] as number) - Date.now())).toBeLessThan(
        60000,
      );
      const serialized = JSON.stringify(feed);
      for (const forbidden of [
        "FAMILY_CALENDAR_URL",
        "SCHOOL_CALENDAR_URL",
        "shadow-1",
        "pinHash",
        CALENDAR_TOKEN,
        "test-ingest-token",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(serialized).not.toContain("http");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("notConfiguredIs503WhileExplicitEmptySucceeds", async () => {
    stubCalendarEnv();
    try {
      const t = setupCalendarTest();
      const auth = { Authorization: `Bearer ${CALENDAR_TOKEN}` };
      // No settings document yet: not configured.
      expect((await getCalendars(t, "/dashboard/calendars", auth)).status).toBe(
        503,
      );
      const parent = await createParentSession(t);
      await t.mutation(api.calendarSources.setConfigured, {
        token: parent.token,
        configured: false,
      });
      expect((await getCalendars(t, "/dashboard/calendars", auth)).status).toBe(
        503,
      );
      // An explicitly empty setup is a full v1 document with empty arrays.
      await t.mutation(api.calendarSources.setConfigured, {
        token: parent.token,
        configured: true,
      });
      const empty = await getCalendars(t, "/dashboard/calendars", auth);
      expect(empty.status).toBe(200);
      const feed = (await empty.json()) as Record<string, unknown>;
      expect(feed["version"]).toBe(1);
      expect(feed["calendars"]).toEqual([]);
      expect(feed["events"]).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("oversizeFeedIs503", async () => {
    stubCalendarEnv();
    try {
      const t = setupCalendarTest();
      const parent = await createParentSession(t);
      await t.mutation(api.calendarSources.setConfigured, {
        token: parent.token,
        configured: true,
      });
      await publishCentralSource(t, parent.token, BASE_SOURCE, [
        eventAt("tiny", 0, 1),
      ]);
      // One source stand larger than the 4MiB HTTP envelope.
      await t.run(async (ctx) => {
        const source = await ctx.db
          .query("calendarSources")
          .withIndex("by_sourceKey", (q) => q.eq("sourceKey", "family"))
          .unique();
        if (source?.publishedDataImportId === undefined) {
          throw new Error("expected published data");
        }
        const now = Date.now();
        const bigTitle = `x`.repeat(6000);
        for (let index = 0; index < 1000; index += 1) {
          await ctx.db.insert("calendarEvents", {
            ...eventAt(`bulk-${String(index)}`, now, now + 3600000),
            title: bigTitle,
            sourceId: source._id,
            importId: source.publishedDataImportId,
          });
        }
      });
      const response = await getCalendars(t, "/dashboard/calendars", {
        Authorization: `Bearer ${CALENDAR_TOKEN}`,
      });
      expect(response.status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("calendar.forUser", () => {
  it("childSeesOnlyAssignedPersonalCalendars (parents keep the family stand)", async () => {
    const t = setupCalendarTest();
    const sessions = await seedConfiguredFeed(t);
    const childFeed = await t.query(api.calendar.forUser, {
      token: sessions.childToken,
    });
    expect(
      childFeed.calendars.map((calendar) => calendar.sourceKey),
    ).toEqual(["school"]);
    expect(childFeed.events).toHaveLength(1);
    expect(childFeed.events[0]?.title).toBe("Event school-1");

    const strangerFeed = await t.query(api.calendar.forUser, {
      token: sessions.strangerToken,
    });
    expect(strangerFeed.calendars).toEqual([]);
    expect(strangerFeed.events).toEqual([]);

    // Family calendars stay parent-visible; calendars assigned to a child
    // are that child's personal stand.
    const parentFeed = await t.query(api.calendar.forUser, {
      token: sessions.parentToken,
    });
    expect(
      parentFeed.calendars.map((calendar) => calendar.sourceKey),
    ).toEqual(["family"]);
    expect(parentFeed.events).toHaveLength(2);

    await expect(
      t.query(api.calendar.forUser, { token: "bogus-token" }),
    ).rejects.toThrow();
  });

  it("danglingPersonBindingStaysHiddenFromParents (fail closed on deleted users)", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const child = await createChildSession(t);
    await t.mutation(api.calendarSources.setConfigured, {
      token: parent.token,
      configured: true,
    });
    await publishCentralSource(t, parent.token, BASE_SOURCE, [
      eventAt("family-1", 0, 1),
    ]);
    await publishCentralSource(
      t,
      parent.token,
      {
        ...BASE_SOURCE,
        sourceKey: "school",
        name: "Schule",
        color: "#16a34a",
        panel: "school",
        order: 1,
        personIds: [child.userId],
        urlEnvKey: "SCHOOL_CALENDAR_URL",
      },
      [eventAt("school-1", 0, 1)],
    );
    // Deleting the child leaves a binding to a person that no longer
    // resolves. The personal stand must not become parent-visible through
    // the dangling id.
    await t.run(async (ctx) => {
      await ctx.db.delete(child.userId);
    });
    const parentFeed = await t.query(api.calendar.forUser, {
      token: parent.token,
    });
    expect(
      parentFeed.calendars.map((calendar) => calendar.sourceKey),
    ).toEqual(["family"]);
  });
});
