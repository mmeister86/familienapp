import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api.js";
import type {
  SceneStart,
  SceneWidget,
} from "../../convex/lib/validators.js";
import {
  createChildSession,
  createParentSession,
  setupCalendarTest,
  type CalendarTestClient,
} from "./setup.js";

type TestClient = CalendarTestClient;

const CLOCK: SceneWidget = {
  id: "clock",
  type: "clock",
  x: 0,
  y: 0,
  w: 12,
  h: 4,
  props: { wide: true, hints: true },
};

const NEWS: SceneWidget = {
  id: "news",
  type: "news",
  x: 0,
  y: 0,
  w: 12,
  h: 4,
};

function start(overrides: Partial<SceneStart> = {}): SceneStart {
  return { schoolDay: "06:45", weekend: "07:30", ...overrides };
}

async function insertPublishedScene(
  t: TestClient,
  scene: {
    sceneId: string;
    kind: "layout" | "night";
    name: string;
    start: SceneStart;
    widgets: SceneWidget[];
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("dashboardScenes", {
      sceneId: scene.sceneId,
      kind: scene.kind,
      draft: null,
      published: {
        name: scene.name,
        start: scene.start,
        widgets: scene.widgets,
      },
      updatedAt: Date.now(),
    });
  });
}

async function insertSettings(t: TestClient, revision: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("familyBackendSettings", {
      key: "scenes",
      configurationRevision: revision,
      configured: true,
      berlinDate: "2026-10-11",
      updatedAt: Date.now(),
    });
  });
}

async function insertNight(t: TestClient) {
  await insertPublishedScene(t, {
    sceneId: "night",
    kind: "night",
    name: "Nacht",
    start: start({ schoolDay: "21:30", weekend: "21:30" }),
    widgets: [],
  });
}

async function insertLayout(
  t: TestClient,
  overrides: {
    sceneId?: string;
    name?: string;
    start?: SceneStart;
    widgets?: SceneWidget[];
  } = {},
) {
  await insertPublishedScene(t, {
    sceneId: overrides.sceneId ?? "morning",
    kind: "layout",
    name: overrides.name ?? "Morgen",
    start: overrides.start ?? start(),
    widgets: overrides.widgets ?? [CLOCK],
  });
}

describe("scene auth", () => {
  it("rejects every function for child tokens", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const child = await createChildSession(t);
    await insertLayout(t);
    await insertNight(t);
    const versionId = await t.run(async (ctx) => {
      return await ctx.db.insert("dashboardSceneVersions", {
        sceneId: "morning",
        snapshot: { name: "Morgen", start: start(), widgets: [CLOCK] },
        publishedAt: Date.now(),
      });
    });

    await expect(
      t.query(api.dashboardScenes.list, { token: child.token }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.query(api.dashboardScenes.catalog, { token: child.token }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.createScene, {
        token: child.token,
        name: "Neu",
        start: start({ schoolDay: "15:30", weekend: null }),
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.saveDraft, {
        token: child.token,
        sceneId: "morning",
        name: "Morgen",
        start: start(),
        widgets: [CLOCK],
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.publish, {
        token: child.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.setNightStart, {
        token: child.token,
        start: start({ schoolDay: "21:30", weekend: "21:30" }),
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.discardDraft, {
        token: child.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.deleteScene, {
        token: child.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.query(api.dashboardScenes.listVersions, {
        token: child.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.restoreVersion, {
        token: child.token,
        sceneId: "morning",
        versionId,
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.resetToDefault, {
        token: child.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/parent/i);
    await expect(
      t.mutation(api.dashboardScenes.sendPreview, {
        token: child.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/parent/i);
    expect(parent.token).not.toBe(child.token);
  });

  it("rejects bogus tokens", async () => {
    const t = setupCalendarTest();
    await expect(
      t.query(api.dashboardScenes.list, { token: "bogus-token" }),
    ).rejects.toThrow();
  });
});

describe("createScene and publish", () => {
  it("keeps the draft out of the feed until publish", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertSettings(t, 1);

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Hausaufgaben",
      start: start({ schoolDay: "15:30", weekend: "15:30" }),
    });
    expect(sceneId.startsWith("s-")).toBe(true);

    const before = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(before.scenes.map((s) => s.id)).toEqual(["night"]);
    expect(before.revision).toBe(1);

    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId,
    });
    const after = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(after.scenes.map((s) => s.id).sort()).toEqual(["night", sceneId]);
    expect(after.revision).toBe(2);
  });

  it("rejects publishing on a duplicate start time", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t, {
      start: start({ schoolDay: "14:00", weekend: null }),
    });

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Neu",
      start: start({ schoolDay: "14:00", weekend: null }),
    });
    await expect(
      t.mutation(api.dashboardScenes.publish, {
        token: parent.token,
        sceneId,
      }),
    ).rejects.toThrow(/schon die Szene/);
  });

  it("rejects publishing without a night scene", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Neu",
      start: start({ schoolDay: "15:30", weekend: null }),
    });
    await expect(
      t.mutation(api.dashboardScenes.publish, {
        token: parent.token,
        sceneId,
      }),
    ).rejects.toThrow(/Nacht/);
  });

  it("reports the feed as unconfigured before the first publish", async () => {
    const t = setupCalendarTest();
    await expect(
      t.query(internal.dashboardScenes.getScenesFeed, {}),
    ).rejects.toThrow(/ScenesNotConfigured/);
  });

  it("copies start and widgets from another scene", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertLayout(t, {
      start: start({ schoolDay: "15:30", weekend: null }),
      widgets: [NEWS],
    });

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Kopie",
      start: start({ schoolDay: "16:30", weekend: null }),
      copyFrom: "morning",
    });
    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    const copy = listed.scenes.find((s) => s.sceneId === sceneId);
    expect(copy?.draft).toEqual({
      name: "Kopie",
      start: start({ schoolDay: "15:30", weekend: null }),
      widgets: [NEWS],
    });
  });

  it("rejects copying from an unknown scene", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await expect(
      t.mutation(api.dashboardScenes.createScene, {
        token: parent.token,
        name: "Kopie",
        start: start({ schoolDay: "16:30", weekend: null }),
        copyFrom: "nope",
      }),
    ).rejects.toThrow(/nicht gefunden/);
  });
});

describe("night scene", () => {
  it("cannot be deleted, rebuilt, reset or previewed", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);

    await expect(
      t.mutation(api.dashboardScenes.deleteScene, {
        token: parent.token,
        sceneId: "night",
      }),
    ).rejects.toThrow(/nicht löschen/);
    await expect(
      t.mutation(api.dashboardScenes.saveDraft, {
        token: parent.token,
        sceneId: "night",
        name: "Nacht",
        start: start({ schoolDay: "21:30", weekend: "21:30" }),
        widgets: [],
      }),
    ).rejects.toThrow(/kein Layout/);
    await expect(
      t.mutation(api.dashboardScenes.resetToDefault, {
        token: parent.token,
        sceneId: "night",
      }),
    ).rejects.toThrow(/kein Standard-Layout/);
    await expect(
      t.mutation(api.dashboardScenes.sendPreview, {
        token: parent.token,
        sceneId: "night",
      }),
    ).rejects.toThrow(/nicht als Vorschau/);
  });

  it("takes new start times immediately and returns the old ones", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);

    const old = await t.mutation(api.dashboardScenes.setNightStart, {
      token: parent.token,
      start: start({ schoolDay: "20:00", weekend: "20:30" }),
    });
    expect(old).toEqual({ schoolDay: "21:30", weekend: "21:30" });

    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.revision).toBe(1);
    const night = listed.scenes.find((s) => s.sceneId === "night");
    expect(night?.published?.start).toEqual({
      schoolDay: "20:00",
      weekend: "20:30",
    });
    expect(night?.draft).toBeNull();
  });

  it("rejects night starts that collide with the schedule", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);

    await expect(
      t.mutation(api.dashboardScenes.setNightStart, {
        token: parent.token,
        start: start({ schoolDay: "06:45", weekend: "20:30" }),
      }),
    ).rejects.toThrow(/schon die Szene/);
  });
});

describe("drafts and versions", () => {
  it("discards the draft but keeps the published stand", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);

    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId: "morning",
      name: "Geändert",
      start: start(),
      widgets: [NEWS],
    });
    const result = await t.mutation(api.dashboardScenes.discardDraft, {
      token: parent.token,
      sceneId: "morning",
    });
    expect(result).toEqual({ deleted: false });

    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    const scene = listed.scenes.find((s) => s.sceneId === "morning");
    expect(scene?.draft).toBeNull();
    expect(scene?.published?.name).toBe("Morgen");
  });

  it("removes a never-published scene with its draft", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Neu",
      start: start({ schoolDay: "15:30", weekend: null }),
    });
    const result = await t.mutation(api.dashboardScenes.discardDraft, {
      token: parent.token,
      sceneId,
    });
    expect(result).toEqual({ deleted: true });

    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.scenes).toHaveLength(0);
  });

  it("trims versions to the last 10 stands", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);

    for (let i = 1; i <= 11; i++) {
      await t.mutation(api.dashboardScenes.saveDraft, {
        token: parent.token,
        sceneId: "morning",
        name: `Stand ${i}`,
        start: start(),
        widgets: [CLOCK],
      });
      await t.mutation(api.dashboardScenes.publish, {
        token: parent.token,
        sceneId: "morning",
      });
    }
    const versions = await t.query(api.dashboardScenes.listVersions, {
      token: parent.token,
      sceneId: "morning",
    });
    expect(versions).toHaveLength(10);
    expect(versions[0]?.snapshot.name).toBe("Stand 11");
    expect(versions[9]?.snapshot.name).toBe("Stand 2");
  });

  it("restores a version as draft only", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Eins",
      start: start({ schoolDay: "15:30", weekend: "15:30" }),
    });
    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId,
    });
    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId,
      name: "Zwei",
      start: start({ schoolDay: "15:30", weekend: "15:30" }),
      widgets: [],
    });
    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId,
    });

    const versions = await t.query(api.dashboardScenes.listVersions, {
      token: parent.token,
      sceneId,
    });
    const first = versions.find((v) => v.snapshot.name === "Eins");
    expect(first).toBeDefined();
    await t.mutation(api.dashboardScenes.restoreVersion, {
      token: parent.token,
      sceneId,
      versionId: first!._id,
    });

    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    const scene = listed.scenes.find((s) => s.sceneId === sceneId);
    expect(scene?.published?.name).toBe("Zwei");
    expect(scene?.draft?.name).toBe("Eins");
  });

  it("reports the publisher name on versions", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);

    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId: "morning",
      name: "Neu",
      start: start(),
      widgets: [CLOCK],
    });
    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId: "morning",
    });
    const versions = await t.query(api.dashboardScenes.listVersions, {
      token: parent.token,
      sceneId: "morning",
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]?.publishedByName).toBe("Test parent");
  });

  it("resets a seeded scene to its built-in stand", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertLayout(t, { name: "Umgebaut", widgets: [] });

    await t.mutation(api.dashboardScenes.resetToDefault, {
      token: parent.token,
      sceneId: "morning",
    });
    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    const scene = listed.scenes.find((s) => s.sceneId === "morning");
    expect(scene?.published?.name).toBe("Umgebaut");
    expect(scene?.draft?.name).toBe("Morgen");
    expect(scene?.draft?.start).toEqual({
      schoolDay: "06:45",
      weekend: "07:30",
    });
    expect(scene?.draft?.widgets).toHaveLength(5);
  });

  it("rejects resetting a custom scene", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertLayout(t, { sceneId: "s-custom", name: "Eigen" });

    await expect(
      t.mutation(api.dashboardScenes.resetToDefault, {
        token: parent.token,
        sceneId: "s-custom",
      }),
    ).rejects.toThrow(/mitgelieferten/);
  });
});

describe("deleteScene", () => {
  it("removes the scene with its versions", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t, {
      start: start({ schoolDay: "06:45", weekend: null }),
    });
    await insertLayout(t, {
      sceneId: "day",
      name: "Tag",
      start: start({ schoolDay: "09:00", weekend: "10:00" }),
      widgets: [NEWS],
    });
    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId: "morning",
      name: "Morgen neu",
      start: start({ schoolDay: "06:45", weekend: null }),
      widgets: [CLOCK],
    });
    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId: "morning",
    });

    await t.mutation(api.dashboardScenes.deleteScene, {
      token: parent.token,
      sceneId: "morning",
    });
    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.scenes.map((s) => s.sceneId).sort()).toEqual([
      "day",
      "night",
    ]);
    expect(listed.revision).toBe(2);
    const versions = await t.query(api.dashboardScenes.listVersions, {
      token: parent.token,
      sceneId: "morning",
    });
    expect(versions).toHaveLength(0);
  });

  it("rejects deleting the last layout scene of a day type", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);

    await expect(
      t.mutation(api.dashboardScenes.deleteScene, {
        token: parent.token,
        sceneId: "morning",
      }),
    ).rejects.toThrow(/muss .* laufen/);
  });

  it("deletes an unpublished scene without bumping and drops its preview", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);
    await insertSettings(t, 3);

    const sceneId = await t.mutation(api.dashboardScenes.createScene, {
      token: parent.token,
      name: "Vorschau",
      start: start({ schoolDay: "15:30", weekend: null }),
    });
    await t.mutation(api.dashboardScenes.sendPreview, {
      token: parent.token,
      sceneId,
    });
    await t.mutation(api.dashboardScenes.deleteScene, {
      token: parent.token,
      sceneId,
    });

    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.revision).toBe(3);
    const feed = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(feed.preview).toBeUndefined();
  });
});

describe("sendPreview", () => {
  it("shows the draft for two minutes in the feed", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);
    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId: "morning",
      name: "Morgen",
      start: start(),
      widgets: [CLOCK],
    });
    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId: "morning",
    });
    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId: "morning",
      name: "Entwurf",
      start: start(),
      widgets: [NEWS],
    });

    const before = Date.now();
    const result = await t.mutation(api.dashboardScenes.sendPreview, {
      token: parent.token,
      sceneId: "morning",
    });
    expect(result.until).toBeGreaterThan(before);
    expect(result.until).toBeLessThanOrEqual(before + 120_000 + 5_000);

    const feed = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(feed.preview?.sceneId).toBe("morning");
    expect(feed.preview?.widgets).toEqual([NEWS]);
  });

  it("omits an expired preview from the feed", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertNight(t);
    await insertLayout(t);
    await t.mutation(api.dashboardScenes.saveDraft, {
      token: parent.token,
      sceneId: "morning",
      name: "Morgen",
      start: start(),
      widgets: [CLOCK],
    });
    await t.mutation(api.dashboardScenes.publish, {
      token: parent.token,
      sceneId: "morning",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("dashboardPreview", {
        sceneId: "morning",
        widgets: [NEWS],
        until: Date.now() - 1_000,
      });
    });

    const feed = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(feed.preview).toBeUndefined();
  });

  it("rejects previewing a scene without content", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("dashboardScenes", {
        sceneId: "s-empty",
        kind: "layout",
        draft: null,
        published: null,
        updatedAt: Date.now(),
      });
    });
    await expect(
      t.mutation(api.dashboardScenes.sendPreview, {
        token: parent.token,
        sceneId: "s-empty",
      }),
    ).rejects.toThrow(/keinen Inhalt/);
  });
});

describe("scene limits", () => {
  it("allows at most 8 layout scenes", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    for (let i = 0; i < 8; i++) {
      await insertLayout(t, {
        sceneId: `s-${i}`,
        name: `Szene ${i}`,
        start: start({ schoolDay: `0${i}:00`, weekend: null }),
      });
    }
    await expect(
      t.mutation(api.dashboardScenes.createScene, {
        token: parent.token,
        name: "Neun",
        start: start({ schoolDay: "20:00", weekend: null }),
      }),
    ).rejects.toThrow(/Höchstens 8/);
  });

  it("rejects taken names", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertLayout(t, { name: "Doppelt" });
    await expect(
      t.mutation(api.dashboardScenes.createScene, {
        token: parent.token,
        name: "doppelt",
        start: start({ schoolDay: "15:30", weekend: null }),
      }),
    ).rejects.toThrow(/gibt es schon/);
  });
});

describe("list and catalog", () => {
  it("sorts scenes by school-day start", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    await insertLayout(t, {
      sceneId: "a",
      name: "A",
      start: start({ schoolDay: "14:00", weekend: null }),
    });
    await insertLayout(t, {
      sceneId: "b",
      name: "B",
      start: start({ schoolDay: "06:45", weekend: null }),
    });
    await insertLayout(t, {
      sceneId: "c",
      name: "C",
      start: start({ schoolDay: null, weekend: "07:30" }),
    });

    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.revision).toBe(0);
    expect(listed.scenes.map((s) => s.sceneId)).toEqual(["b", "c", "a"]);
  });

  it("serves the widget catalog", async () => {
    const t = setupCalendarTest();
    const parent = await createParentSession(t);
    const catalog = await t.query(api.dashboardScenes.catalog, {
      token: parent.token,
    });
    expect(catalog).toHaveLength(7);
    expect(catalog[0]).toEqual({
      type: "clock",
      name: "Uhr & Wetter",
      minW: 4,
      minH: 3,
    });
  });
});

describe("seedDefaultScenes", () => {
  it("seeds the five current scenes as published on an empty database", async () => {
    const t = setupCalendarTest();

    const result = await t.mutation(
      internal.dashboardScenes.seedDefaultScenes,
      {},
    );
    expect(result.seeded.sort()).toEqual([
      "afternoon",
      "day",
      "evening",
      "morning",
      "night",
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.revision).toBe(1);

    const parent = await createParentSession(t);
    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.revision).toBe(1);
    expect(listed.scenes.map((s) => s.sceneId)).toEqual([
      "morning",
      "day",
      "afternoon",
      "evening",
      "night",
    ]);
    for (const scene of listed.scenes) {
      expect(scene.draft).toBeNull();
      expect(scene.published).not.toBeNull();
    }

    const feed = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(feed.version).toBe(1);
    expect(feed.grid).toEqual({ cols: 12, rows: 24 });
    expect(feed.revision).toBe(1);
    expect(feed.scenes).toHaveLength(5);
    const night = feed.scenes.find((s) => s.id === "night");
    expect(night).toBeDefined();
    expect("widgets" in night!).toBe(false);
    const morning = feed.scenes.find((s) => s.id === "morning");
    expect(morning?.widgets).toHaveLength(5);
  });

  it("skips existing scenes, keeps their content, bumps for added scenes", async () => {
    const t = setupCalendarTest();
    await insertLayout(t, { name: "Umgebaut" });
    await insertSettings(t, 5);

    const result = await t.mutation(
      internal.dashboardScenes.seedDefaultScenes,
      {},
    );
    expect(result.seeded.sort()).toEqual([
      "afternoon",
      "day",
      "evening",
      "night",
    ]);
    expect(result.skipped).toEqual(["morning"]);
    expect(result.revision).toBe(6);

    const parent = await createParentSession(t);
    const listed = await t.query(api.dashboardScenes.list, {
      token: parent.token,
    });
    expect(listed.revision).toBe(6);
    const morning = listed.scenes.find((s) => s.sceneId === "morning");
    expect(morning?.published?.name).toBe("Umgebaut");
  });

  it("leaves the revision alone when everything is already seeded", async () => {
    const t = setupCalendarTest();
    await t.mutation(internal.dashboardScenes.seedDefaultScenes, {});

    const result = await t.mutation(
      internal.dashboardScenes.seedDefaultScenes,
      {},
    );
    expect(result.seeded).toEqual([]);
    expect(result.skipped).toHaveLength(5);
    expect(result.revision).toBe(1);
  });

  it("repairs unconfigured settings without bumping", async () => {
    const t = setupCalendarTest();
    await t.mutation(internal.dashboardScenes.seedDefaultScenes, {});
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("familyBackendSettings")
        .withIndex("by_key", (q) => q.eq("key", "scenes"))
        .unique();
      await ctx.db.patch(settings!._id, { configured: false });
    });

    const result = await t.mutation(
      internal.dashboardScenes.seedDefaultScenes,
      {},
    );
    expect(result.seeded).toEqual([]);
    expect(result.revision).toBe(1);

    const feed = await t.query(internal.dashboardScenes.getScenesFeed, {});
    expect(feed.scenes).toHaveLength(5);
  });
});
