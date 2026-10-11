// Wall-dashboard scenes (Phase 8): parents compose the schedule and tile
// layouts in /layouts; the wall polls the published stands via
// GET /dashboard/scenes (see ./http.ts). Drafts never reach the wall.
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type DatabaseReader,
  type MutationCtx,
} from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { requireParent } from "./lib/auth";
import { WIDGET_CATALOG } from "./lib/dashboardWidgets";
import { todayBerlin } from "./lib/dates";
import { DEFAULT_SCENES, defaultScene } from "./lib/defaultScenes";
import {
  assertDayTypesCovered,
  assertScheduleCompatible,
  assertUniqueSceneName,
  assertValidSceneName,
  assertValidStart,
  assertValidWidgets,
  type SceneCoverageEntry,
  type SceneScheduleEntry,
} from "./lib/scenes";
import {
  sceneStartValidator,
  sceneWidgetValidator,
  scenesFeedValidator,
  type SceneWidget,
} from "./lib/validators";

export const SCENES_NOT_CONFIGURED = "ScenesNotConfigured";

const SCENES_SETTINGS_KEY = "scenes";
const MAX_LAYOUT_SCENES = 8;
const MAX_VERSIONS_PER_SCENE = 10;
const PREVIEW_DURATION_MS = 2 * 60 * 1000;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

type SceneDoc = Doc<"dashboardScenes">;
type DbReader = { db: DatabaseReader };

function notConfigured(): never {
  throw new ConvexError(`${SCENES_NOT_CONFIGURED}: no scenes published yet`);
}

async function getSceneOrThrow(
  ctx: DbReader,
  sceneId: string,
): Promise<SceneDoc> {
  const scene = await ctx.db
    .query("dashboardScenes")
    .withIndex("by_sceneId", (q) => q.eq("sceneId", sceneId))
    .unique();
  if (scene === null) {
    throw new ConvexError(`Szene „${sceneId}" nicht gefunden.`);
  }
  return scene;
}

// Every name other scenes go by (drafts and published stands): a new name
// must not clash with either, so renaming can never strand a twin.
function otherNames(
  scenes: readonly SceneDoc[],
  sceneId: string,
): { sceneId: string; name: string }[] {
  const names: { sceneId: string; name: string }[] = [];
  for (const scene of scenes) {
    if (scene.sceneId === sceneId) {
      continue;
    }
    if (scene.draft !== null) {
      names.push({ sceneId: scene.sceneId, name: scene.draft.name });
    }
    if (scene.published !== null) {
      names.push({ sceneId: scene.sceneId, name: scene.published.name });
    }
  }
  return names;
}

function publishedSchedule(
  scenes: readonly SceneDoc[],
  excludeSceneId: string,
): SceneScheduleEntry[] {
  return scenes.flatMap((scene) =>
    scene.sceneId === excludeSceneId || scene.published === null
      ? []
      : [
          {
            sceneId: scene.sceneId,
            name: scene.published.name,
            start: scene.published.start,
          },
        ],
  );
}

function publishedCoverage(
  scenes: readonly SceneDoc[],
  excludeSceneId: string,
): SceneCoverageEntry[] {
  return scenes.flatMap((scene) =>
    scene.sceneId === excludeSceneId || scene.published === null
      ? []
      : [{ kind: scene.kind, start: scene.published.start }],
  );
}

function startSortKey(scene: SceneDoc): string {
  const current = scene.draft ?? scene.published;
  return (
    current?.start.schoolDay ?? current?.start.weekend ?? "99:99"
  );
}

function compareByStart(
  a: { key: string; sceneId: string },
  b: { key: string; sceneId: string },
): number {
  if (a.key !== b.key) {
    return a.key < b.key ? -1 : 1;
  }
  if (a.sceneId === b.sceneId) {
    return 0;
  }
  return a.sceneId < b.sceneId ? -1 : 1;
}

function newSceneId(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ID_ALPHABET.charAt(
      Math.floor(Math.random() * ID_ALPHABET.length),
    );
  }
  return `s-${suffix}`;
}

async function currentRevision(ctx: DbReader): Promise<number> {
  const settings = await ctx.db
    .query("familyBackendSettings")
    .withIndex("by_key", (q) => q.eq("key", SCENES_SETTINGS_KEY))
    .unique();
  return settings?.configurationRevision ?? 0;
}

async function bumpRevision(ctx: MutationCtx): Promise<number> {
  const now = Date.now();
  const existing = await ctx.db
    .query("familyBackendSettings")
    .withIndex("by_key", (q) => q.eq("key", SCENES_SETTINGS_KEY))
    .unique();
  if (existing === null) {
    await ctx.db.insert("familyBackendSettings", {
      key: SCENES_SETTINGS_KEY,
      configurationRevision: 1,
      configured: true,
      berlinDate: todayBerlin(),
      updatedAt: now,
    });
    return 1;
  }
  const revision = existing.configurationRevision + 1;
  await ctx.db.patch(existing._id, {
    configurationRevision: revision,
    configured: true,
    updatedAt: now,
  });
  return revision;
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const scenes = await ctx.db.query("dashboardScenes").collect();
    const sorted = scenes
      .map((scene) => ({ key: startSortKey(scene), scene }))
      .sort((a, b) =>
        compareByStart(
          { key: a.key, sceneId: a.scene.sceneId },
          { key: b.key, sceneId: b.scene.sceneId },
        ),
      );
    return {
      revision: await currentRevision(ctx),
      scenes: sorted.map(({ scene }) => ({
        sceneId: scene.sceneId,
        kind: scene.kind,
        draft: scene.draft,
        published: scene.published,
        updatedAt: scene.updatedAt,
      })),
    };
  },
});

export const catalog = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    return WIDGET_CATALOG;
  },
});

export const createScene = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    start: sceneStartValidator,
    copyFrom: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const name = args.name.trim();
    assertValidSceneName(name);
    const scenes = await ctx.db.query("dashboardScenes").collect();
    if (
      scenes.filter((scene) => scene.kind === "layout").length >=
      MAX_LAYOUT_SCENES
    ) {
      throw new ConvexError(
        `Höchstens ${MAX_LAYOUT_SCENES} Szenen lassen sich anlegen (ohne Nacht).`,
      );
    }
    assertUniqueSceneName(name, "", otherNames(scenes, ""));
    let draftStart = args.start;
    let copiedWidgets: SceneWidget[] = [];
    if (args.copyFrom !== undefined) {
      const source = await getSceneOrThrow(ctx, args.copyFrom);
      const snapshot = source.draft ?? source.published;
      if (snapshot === null) {
        throw new ConvexError(
          `Die Szene „${args.copyFrom}" hat keinen Inhalt zum Kopieren.`,
        );
      }
      draftStart = snapshot.start;
      copiedWidgets = snapshot.widgets;
    }
    assertValidStart(draftStart);
    assertValidWidgets(copiedWidgets);
    let sceneId = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = newSceneId();
      const clash = await ctx.db
        .query("dashboardScenes")
        .withIndex("by_sceneId", (q) => q.eq("sceneId", candidate))
        .unique();
      if (clash === null) {
        sceneId = candidate;
        break;
      }
    }
    if (sceneId === "") {
      throw new ConvexError(
        "Die Szene lässt sich gerade nicht anlegen, bitte erneut versuchen.",
      );
    }
    await ctx.db.insert("dashboardScenes", {
      sceneId,
      kind: "layout",
      draft: { name, start: draftStart, widgets: [...copiedWidgets] },
      published: null,
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    return sceneId;
  },
});

export const saveDraft = mutation({
  args: {
    token: v.string(),
    sceneId: v.string(),
    name: v.string(),
    start: sceneStartValidator,
    widgets: v.array(sceneWidgetValidator),
  },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.kind === "night") {
      throw new ConvexError(
        "Die Nacht-Szene hat kein Layout; nur ihre Startzeiten lassen sich ändern.",
      );
    }
    const name = args.name.trim();
    assertValidSceneName(name);
    assertValidStart(args.start);
    assertValidWidgets(args.widgets);
    const scenes = await ctx.db.query("dashboardScenes").collect();
    assertUniqueSceneName(
      name,
      scene.sceneId,
      otherNames(scenes, scene.sceneId),
    );
    await ctx.db.patch(scene._id, {
      draft: { name, start: args.start, widgets: args.widgets },
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const publish = mutation({
  args: { token: v.string(), sceneId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.kind === "night") {
      throw new ConvexError(
        "Die Nacht-Szene hat kein Layout; nur ihre Startzeiten lassen sich ändern.",
      );
    }
    const draft = scene.draft;
    if (draft === null) {
      throw new ConvexError("Diese Szene hat keinen Entwurf zum Veröffentlichen.");
    }
    assertValidSceneName(draft.name);
    assertValidStart(draft.start);
    assertValidWidgets(draft.widgets);
    const scenes = await ctx.db.query("dashboardScenes").collect();
    assertUniqueSceneName(
      draft.name,
      scene.sceneId,
      otherNames(scenes, scene.sceneId),
    );
    const night = scenes.find(
      (candidate) =>
        candidate.kind === "night" && candidate.published !== null,
    );
    if (night === undefined) {
      throw new ConvexError(
        "Die Nacht-Szene fehlt – bitte zuerst die Standard-Szenen seeden.",
      );
    }
    assertScheduleCompatible(
      { sceneId: scene.sceneId, name: draft.name, start: draft.start },
      publishedSchedule(scenes, scene.sceneId),
    );
    assertDayTypesCovered([
      ...publishedCoverage(scenes, scene.sceneId),
      { kind: "layout" as const, start: draft.start },
    ]);
    const now = Date.now();
    const latest = await ctx.db
      .query("dashboardSceneVersions")
      .withIndex("by_scene_publishedAt", (q) =>
        q.eq("sceneId", scene.sceneId),
      )
      .order("desc")
      .take(1);
    // Strictly increasing stamps keep newest-first order (and the trim below)
    // deterministic even for two publishes within one millisecond.
    const publishedAt = Math.max(now, (latest[0]?.publishedAt ?? 0) + 1);
    await ctx.db.insert("dashboardSceneVersions", {
      sceneId: scene.sceneId,
      snapshot: draft,
      publishedBy: caller._id,
      publishedAt,
    });
    const versions = await ctx.db
      .query("dashboardSceneVersions")
      .withIndex("by_scene_publishedAt", (q) =>
        q.eq("sceneId", scene.sceneId),
      )
      .order("desc")
      .collect();
    for (const stale of versions.slice(MAX_VERSIONS_PER_SCENE)) {
      await ctx.db.delete(stale._id);
    }
    await ctx.db.patch(scene._id, {
      published: draft,
      draft: null,
      updatedBy: caller._id,
      updatedAt: now,
    });
    await bumpRevision(ctx);
    return null;
  },
});

export const setNightStart = mutation({
  args: { token: v.string(), start: sceneStartValidator },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    assertValidStart(args.start);
    const scenes = await ctx.db.query("dashboardScenes").collect();
    const night = scenes.find((scene) => scene.kind === "night");
    if (night === undefined || night.published === null) {
      throw new ConvexError(
        "Die Nacht-Szene fehlt – bitte zuerst die Standard-Szenen seeden.",
      );
    }
    assertScheduleCompatible(
      {
        sceneId: night.sceneId,
        name: night.published.name,
        start: args.start,
      },
      publishedSchedule(scenes, night.sceneId),
    );
    const old = night.published.start;
    await ctx.db.patch(night._id, {
      published: { ...night.published, start: args.start },
      draft: null,
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    await bumpRevision(ctx);
    return { schoolDay: old.schoolDay, weekend: old.weekend };
  },
});

export const discardDraft = mutation({
  args: { token: v.string(), sceneId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.published === null) {
      // Same as deleteScene: a deleted scene takes its preview with it.
      const previews = await ctx.db.query("dashboardPreview").collect();
      for (const preview of previews) {
        if (preview.sceneId === scene.sceneId) {
          await ctx.db.delete(preview._id);
        }
      }
      await ctx.db.delete(scene._id);
      return { deleted: true };
    }
    await ctx.db.patch(scene._id, {
      draft: null,
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    return { deleted: false };
  },
});

export const deleteScene = mutation({
  args: { token: v.string(), sceneId: v.string() },
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.kind === "night") {
      throw new ConvexError("Die Nacht-Szene lässt sich nicht löschen.");
    }
    const scenes = await ctx.db.query("dashboardScenes").collect();
    // A bare draft contributes no published coverage, so deleting one must
    // never fail on the remaining stands.
    if (scene.published !== null) {
      assertDayTypesCovered(publishedCoverage(scenes, scene.sceneId));
    }
    const versions = await ctx.db
      .query("dashboardSceneVersions")
      .withIndex("by_scene_publishedAt", (q) =>
        q.eq("sceneId", scene.sceneId),
      )
      .collect();
    for (const version of versions) {
      await ctx.db.delete(version._id);
    }
    // A deleted scene takes its preview with it, so the wall drops it at once.
    const previews = await ctx.db.query("dashboardPreview").collect();
    for (const preview of previews) {
      if (preview.sceneId === scene.sceneId) {
        await ctx.db.delete(preview._id);
      }
    }
    await ctx.db.delete(scene._id);
    // Only published stands reach the wall: deleting a bare draft is silent.
    if (scene.published !== null) {
      await bumpRevision(ctx);
    }
    return null;
  },
});

export const listVersions = query({
  args: { token: v.string(), sceneId: v.string() },
  handler: async (ctx, args) => {
    await requireParent(ctx, args.token);
    const versions = await ctx.db
      .query("dashboardSceneVersions")
      .withIndex("by_scene_publishedAt", (q) =>
        q.eq("sceneId", args.sceneId),
      )
      .order("desc")
      .take(MAX_VERSIONS_PER_SCENE);
    const names = new Map<string, string>();
    for (const version of versions) {
      if (
        version.publishedBy !== undefined &&
        !names.has(version.publishedBy)
      ) {
        const user = await ctx.db.get(version.publishedBy);
        names.set(version.publishedBy, user?.name ?? "Unbekannt");
      }
    }
    return versions.map((version) => ({
      _id: version._id,
      snapshot: version.snapshot,
      publishedByName:
        version.publishedBy === undefined
          ? null
          : (names.get(version.publishedBy) ?? "Unbekannt"),
      publishedAt: version.publishedAt,
    }));
  },
});

export const restoreVersion = mutation({
  args: {
    token: v.string(),
    sceneId: v.string(),
    versionId: v.id("dashboardSceneVersions"),
  },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.kind === "night") {
      throw new ConvexError("Die Nacht-Szene hat keine Versionen.");
    }
    const version = await ctx.db.get(args.versionId);
    if (version === null || version.sceneId !== scene.sceneId) {
      throw new ConvexError("Diese Version gibt es nicht.");
    }
    // The old name may belong to another scene by now; restoring it as a
    // draft would strand both scenes on the uniqueness check.
    const scenes = await ctx.db.query("dashboardScenes").collect();
    assertUniqueSceneName(
      version.snapshot.name,
      scene.sceneId,
      otherNames(scenes, scene.sceneId),
    );
    await ctx.db.patch(scene._id, {
      draft: version.snapshot,
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const resetToDefault = mutation({
  args: { token: v.string(), sceneId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.kind === "night") {
      throw new ConvexError("Die Nacht hat kein Standard-Layout.");
    }
    const defaults = defaultScene(scene.sceneId);
    if (defaults === undefined) {
      throw new ConvexError(
        "Nur die mitgelieferten Szenen lassen sich zurücksetzen.",
      );
    }
    const scenes = await ctx.db.query("dashboardScenes").collect();
    assertUniqueSceneName(
      defaults.name,
      scene.sceneId,
      otherNames(scenes, scene.sceneId),
    );
    await ctx.db.patch(scene._id, {
      draft: {
        name: defaults.name,
        start: defaults.start,
        widgets: [...defaults.widgets],
      },
      updatedBy: caller._id,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const sendPreview = mutation({
  args: { token: v.string(), sceneId: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireParent(ctx, args.token);
    const scene = await getSceneOrThrow(ctx, args.sceneId);
    if (scene.kind === "night") {
      throw new ConvexError(
        "Die Nacht lässt sich nicht als Vorschau an die Wand senden.",
      );
    }
    const snapshot = scene.draft ?? scene.published;
    if (snapshot === null) {
      throw new ConvexError("Die Szene hat keinen Inhalt zum Anzeigen.");
    }
    const existing = await ctx.db.query("dashboardPreview").collect();
    for (const preview of existing) {
      await ctx.db.delete(preview._id);
    }
    const until = Date.now() + PREVIEW_DURATION_MS;
    await ctx.db.insert("dashboardPreview", {
      sceneId: scene.sceneId,
      widgets: snapshot.widgets,
      until,
      requestedBy: caller._id,
    });
    return { until };
  },
});

// Device feed for the Go dashboard (via GET /dashboard/scenes): the
// published stands plus the active preview, if any.
export const getScenesFeed = internalQuery({
  args: {},
  returns: scenesFeedValidator,
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("familyBackendSettings")
      .withIndex("by_key", (q) => q.eq("key", SCENES_SETTINGS_KEY))
      .unique();
    if (settings === null || !settings.configured) {
      notConfigured();
    }
    const now = Date.now();
    const scenes = await ctx.db.query("dashboardScenes").collect();
    const entries = scenes
      .flatMap((scene) =>
        scene.published === null
          ? []
          : [
              {
                key:
                  scene.published.start.schoolDay ??
                  scene.published.start.weekend ??
                  "99:99",
                scene,
                published: scene.published,
              },
            ],
      )
      .sort((a, b) =>
        compareByStart(
          { key: a.key, sceneId: a.scene.sceneId },
          { key: b.key, sceneId: b.scene.sceneId },
        ),
      );
    const previews = await ctx.db.query("dashboardPreview").collect();
    const preview = previews.find((candidate) => candidate.until > now);
    return {
      version: 1 as const,
      revision: settings.configurationRevision,
      grid: { cols: 12 as const, rows: 24 as const },
      scenes: entries.map(({ scene, published }) =>
        scene.kind === "night"
          ? {
              id: scene.sceneId,
              name: published.name,
              kind: scene.kind,
              start: published.start,
            }
          : {
              id: scene.sceneId,
              name: published.name,
              kind: scene.kind,
              start: published.start,
              widgets: published.widgets,
            },
      ),
      ...(preview === undefined
        ? {}
        : {
            preview: {
              sceneId: preview.sceneId,
              until: preview.until,
              widgets: preview.widgets,
            },
          }),
    };
  },
});

// One-time setup (and safe to re-run): `npx convex run dashboardScenes:seedDefaultScenes`.
// Inserts the built-in scenes as published stands so the wall looks unchanged
// after the switch; existing scenes are never touched.
export const seedDefaultScenes = internalMutation({
  args: {},
  returns: v.object({
    seeded: v.array(v.string()),
    skipped: v.array(v.string()),
    revision: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const scenes = await ctx.db.query("dashboardScenes").collect();
    const existing = new Set(scenes.map((scene) => scene.sceneId));
    const missing = DEFAULT_SCENES.filter(
      (defaults) => !existing.has(defaults.sceneId),
    );
    // A reseed after deletes must not break what parents changed: validate
    // the combined configuration before inserting anything.
    let layoutCount = scenes.filter(
      (scene) => scene.kind === "layout",
    ).length;
    const names: { sceneId: string; name: string }[] = scenes.flatMap(
      (scene) => {
        const entries: { sceneId: string; name: string }[] = [];
        if (scene.draft !== null) {
          entries.push({ sceneId: scene.sceneId, name: scene.draft.name });
        }
        if (scene.published !== null) {
          entries.push({ sceneId: scene.sceneId, name: scene.published.name });
        }
        return entries;
      },
    );
    const schedule: SceneScheduleEntry[] = scenes.flatMap((scene) =>
      scene.published === null
        ? []
        : [
            {
              sceneId: scene.sceneId,
              name: scene.published.name,
              start: scene.published.start,
            },
          ],
    );
    for (const defaults of missing) {
      if (defaults.kind === "layout") {
        if (layoutCount >= MAX_LAYOUT_SCENES) {
          throw new ConvexError(
            `Höchstens ${MAX_LAYOUT_SCENES} Szenen lassen sich anlegen (ohne Nacht).`,
          );
        }
        layoutCount += 1;
      }
      assertUniqueSceneName(defaults.name, defaults.sceneId, names);
      names.push({ sceneId: defaults.sceneId, name: defaults.name });
      assertScheduleCompatible(
        {
          sceneId: defaults.sceneId,
          name: defaults.name,
          start: defaults.start,
        },
        schedule,
      );
      schedule.push({
        sceneId: defaults.sceneId,
        name: defaults.name,
        start: defaults.start,
      });
    }
    const seeded: string[] = [];
    const skipped: string[] = [];
    for (const defaults of DEFAULT_SCENES) {
      if (existing.has(defaults.sceneId)) {
        skipped.push(defaults.sceneId);
        continue;
      }
      await ctx.db.insert("dashboardScenes", {
        sceneId: defaults.sceneId,
        kind: defaults.kind,
        draft: null,
        published: {
          name: defaults.name,
          start: defaults.start,
          widgets: [...defaults.widgets],
        },
        updatedAt: now,
      });
      seeded.push(defaults.sceneId);
    }
    const settings = await ctx.db
      .query("familyBackendSettings")
      .withIndex("by_key", (q) => q.eq("key", SCENES_SETTINGS_KEY))
      .unique();
    if (settings === null) {
      await ctx.db.insert("familyBackendSettings", {
        key: SCENES_SETTINGS_KEY,
        configurationRevision: 1,
        configured: true,
        berlinDate: todayBerlin(),
        updatedAt: now,
      });
      return { seeded, skipped, revision: 1 };
    }
    if (seeded.length === 0 && settings.configured) {
      return { seeded, skipped, revision: settings.configurationRevision };
    }
    // Reseeding after deletes changes the feed, so revision-keyed consumers
    // must see a bump; a stray unconfigured flag is repaired along the way.
    const revision =
      seeded.length > 0
        ? settings.configurationRevision + 1
        : settings.configurationRevision;
    await ctx.db.patch(settings._id, {
      configurationRevision: revision,
      configured: true,
      updatedAt: now,
    });
    return { seeded, skipped, revision };
  },
});
