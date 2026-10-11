import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api.js";
import {
  createParentSession,
  setupCalendarTest,
  type CalendarTestClient,
} from "./setup.js";

const SCENES_TOKEN = "test-scenes-device-token";

function stubScenesEnv(): void {
  vi.stubEnv("SCENES_DASHBOARD_TOKEN", SCENES_TOKEN);
  vi.stubEnv("DASHBOARD_TOKEN", "test-dashboard-token");
  vi.stubEnv("INGEST_TOKEN", "test-ingest-token");
  vi.stubEnv("CALENDAR_DASHBOARD_TOKEN", "test-calendar-token");
}

async function getScenes(
  t: CalendarTestClient,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await t.fetch("/dashboard/scenes", { headers });
}

describe("GET /dashboard/scenes", () => {
  it("rejects missing, wrong and foreign tokens (scenes token never ingests)", async () => {
    stubScenesEnv();
    try {
      const t = setupCalendarTest();
      await t.mutation(internal.dashboardScenes.seedDefaultScenes, {});

      expect((await getScenes(t)).status).toBe(401);
      expect(
        (
          await getScenes(t, { Authorization: "Bearer wrong-token" })
        ).status,
      ).toBe(401);
      for (const foreign of [
        "test-dashboard-token",
        "test-ingest-token",
        "test-calendar-token",
      ]) {
        expect(
          (await getScenes(t, { Authorization: `Bearer ${foreign}` })).status,
        ).toBe(401);
      }
      expect(
        (
          await getScenes(t, { Authorization: `Bearer ${SCENES_TOKEN}` })
        ).status,
      ).toBe(200);

      // The scenes device token authorizes the feed but no ingest route.
      const ingest = await t.fetch("/ingest/child", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SCENES_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ childSlug: "x", days: [] }),
      });
      expect(ingest.status).toBe(401);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("serves the published stands (sorted, night without widgets, no-store)", async () => {
    stubScenesEnv();
    try {
      const t = setupCalendarTest();
      await t.mutation(internal.dashboardScenes.seedDefaultScenes, {});

      const response = await getScenes(t, {
        Authorization: `Bearer ${SCENES_TOKEN}`,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Content-Type")).toContain(
        "application/json",
      );
      const feed = (await response.json()) as Record<string, unknown>;
      // Same contract shape as tests/fixtures/dashboard-scenes-v1.json.
      expect(Object.keys(feed).sort()).toEqual(
        ["grid", "revision", "scenes", "version"].sort(),
      );
      expect(feed["version"]).toBe(1);
      expect(feed["grid"]).toEqual({ cols: 12, rows: 24 });
      expect(feed["revision"]).toBe(1);
      const scenes = feed["scenes"] as Array<Record<string, unknown>>;
      expect(scenes.map((scene) => scene["id"])).toEqual([
        "morning",
        "day",
        "afternoon",
        "evening",
        "night",
      ]);
      const night = scenes.find((scene) => scene["id"] === "night");
      expect(night).toBeDefined();
      expect("widgets" in night!).toBe(false);
      const morning = scenes.find((scene) => scene["id"] === "morning");
      expect(
        (morning?.["widgets"] as Array<unknown>).length,
      ).toBe(5);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("includes the active preview", async () => {
    stubScenesEnv();
    try {
      const t = setupCalendarTest();
      await t.mutation(internal.dashboardScenes.seedDefaultScenes, {});
      const parent = await createParentSession(t);
      const { until } = await t.mutation(api.dashboardScenes.sendPreview, {
        token: parent.token,
        sceneId: "morning",
      });

      const response = await getScenes(t, {
        Authorization: `Bearer ${SCENES_TOKEN}`,
      });
      expect(response.status).toBe(200);
      const feed = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(feed).sort()).toEqual(
        ["grid", "preview", "revision", "scenes", "version"].sort(),
      );
      const preview = feed["preview"] as Record<string, unknown>;
      expect(preview["sceneId"]).toBe("morning");
      expect(preview["until"]).toBe(until);
      expect((preview["widgets"] as Array<unknown>).length).toBe(5);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("answers 503 before the seed ran", async () => {
    stubScenesEnv();
    try {
      const t = setupCalendarTest();
      const response = await getScenes(t, {
        Authorization: `Bearer ${SCENES_TOKEN}`,
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
