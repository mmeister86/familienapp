import { describe, expect, it } from "vitest";
import {
  GRID_COLS,
  GRID_ROWS,
  WIDGET_CATALOG,
  isWidgetType,
  widgetDef,
} from "../../convex/lib/dashboardWidgets.js";
import { DEFAULT_SCENES } from "../../convex/lib/defaultScenes.js";
import {
  assertDayTypesCovered,
  assertScheduleCompatible,
  assertUniqueSceneName,
  assertValidSceneName,
  assertValidStart,
  assertValidWidgets,
} from "../../convex/lib/scenes.js";
import {
  scenesFeedValidator,
  type SceneStart,
  type SceneWidget,
  type ScenesFeed,
} from "../../convex/lib/validators.js";
import {
  assertMatchesValidator,
  loadJsonFixture,
  type ValidatorJson,
} from "./validatorFixture.js";

function widget(overrides: Partial<SceneWidget> = {}): SceneWidget {
  return {
    id: "clock",
    type: "clock",
    x: 0,
    y: 0,
    w: 12,
    h: 4,
    props: { wide: true, hints: true },
    ...overrides,
  };
}

function start(overrides: Partial<SceneStart> = {}): SceneStart {
  return { schoolDay: "06:45", weekend: "07:30", ...overrides };
}

describe("widget catalog", () => {
  it("uses a 12 x 24 portrait grid", () => {
    expect(GRID_COLS).toBe(12);
    expect(GRID_ROWS).toBe(24);
  });

  it("lists all seven widget types with German names and minimum sizes", () => {
    expect(WIDGET_CATALOG).toEqual([
      { type: "clock", name: "Uhr & Wetter", minW: 4, minH: 3 },
      { type: "shopping", name: "Einkaufsliste (Bring!)", minW: 4, minH: 4 },
      { type: "briefing", name: "KI-Briefing", minW: 4, minH: 4 },
      { type: "news", name: "Nachrichten", minW: 4, minH: 3 },
      { type: "photos", name: "Fotorahmen", minW: 4, minH: 4 },
      { type: "school", name: "Schule & Essen", minW: 6, minH: 4 },
      { type: "calendars", name: "Kalender", minW: 6, minH: 4 },
    ]);
  });

  it("looks up definitions and narrows unknown types", () => {
    expect(widgetDef("school")).toEqual({
      type: "school",
      name: "Schule & Essen",
      minW: 6,
      minH: 4,
    });
    expect(widgetDef("nope")).toBeUndefined();
    expect(isWidgetType("news")).toBe(true);
    expect(isWidgetType("nope")).toBe(false);
  });
});

describe("assertValidSceneName", () => {
  it("accepts a normal name", () => {
    expect(() => assertValidSceneName("Hausaufgaben")).not.toThrow();
  });

  it("rejects empty and blank names", () => {
    expect(() => assertValidSceneName("")).toThrow(/1–30 Zeichen/);
    expect(() => assertValidSceneName("   ")).toThrow(/1–30 Zeichen/);
  });

  it("rejects names longer than 30 characters", () => {
    expect(() => assertValidSceneName("x".repeat(31))).toThrow(/1–30 Zeichen/);
    expect(() => assertValidSceneName("x".repeat(30))).not.toThrow();
  });
});

describe("assertUniqueSceneName", () => {
  const others = [{ sceneId: "morning", name: "Morgen" }];

  it("accepts a fresh name", () => {
    expect(() =>
      assertUniqueSceneName("Hausaufgaben", "s-k3f9q2", others),
    ).not.toThrow();
  });

  it("accepts keeping the scene's own name", () => {
    expect(() =>
      assertUniqueSceneName("Morgen", "morning", others),
    ).not.toThrow();
  });

  it("rejects a taken name, case-insensitively", () => {
    expect(() =>
      assertUniqueSceneName("Morgen", "s-k3f9q2", others),
    ).toThrow(/gibt es schon/);
    expect(() =>
      assertUniqueSceneName("morgen", "s-k3f9q2", others),
    ).toThrow(/gibt es schon/);
  });
});

describe("assertValidStart", () => {
  it("accepts HH:MM times and null opt-outs", () => {
    expect(() => assertValidStart(start())).not.toThrow();
    expect(() =>
      assertValidStart(start({ weekend: null })),
    ).not.toThrow();
    expect(() =>
      assertValidStart(start({ schoolDay: null, weekend: "07:30" })),
    ).not.toThrow();
  });

  it("rejects scenes that never run", () => {
    expect(() =>
      assertValidStart(start({ schoolDay: null, weekend: null })),
    ).toThrow(/mindestens an einem Tag/);
  });

  it("rejects malformed times", () => {
    for (const bad of ["6:45", "24:00", "06:60", "ab:cd", "0645", ""]) {
      expect(() => assertValidStart(start({ schoolDay: bad }))).toThrow(
        /keine gültige Uhrzeit/,
      );
    }
  });
});

describe("assertValidWidgets", () => {
  it("accepts an empty layout and a single widget", () => {
    expect(() => assertValidWidgets([])).not.toThrow();
    expect(() => assertValidWidgets([widget()])).not.toThrow();
  });

  it("rejects widgets outside the 12 x 24 grid", () => {
    expect(() => assertValidWidgets([widget({ x: 9, w: 4 })])).toThrow(
      /ragt aus dem Raster/,
    );
    expect(() => assertValidWidgets([widget({ y: 21, h: 4 })])).toThrow(
      /ragt aus dem Raster/,
    );
    expect(() => assertValidWidgets([widget({ x: -1 })])).toThrow(
      /ragt aus dem Raster/,
    );
  });

  it("rejects overlapping widgets but allows touching edges", () => {
    const a = widget({ id: "a", x: 0, y: 0, w: 6, h: 4 });
    const b = widget({
      id: "b",
      type: "news",
      props: undefined,
      x: 5,
      y: 0,
      w: 6,
      h: 4,
    });
    expect(() => assertValidWidgets([a, b])).toThrow(/überlappen/);
    const touching = { ...b, x: 6 };
    expect(() => assertValidWidgets([a, touching])).not.toThrow();
  });

  it("rejects duplicate widget ids", () => {
    const a = widget({ id: "same" });
    const b = widget({ id: "same", type: "news", props: undefined });
    expect(() => assertValidWidgets([a, b])).toThrow(/doppelt/);
  });

  it("rejects the same type twice per scene", () => {
    const a = widget({ id: "a" });
    const b = widget({ id: "b", x: 0, y: 4 });
    expect(() => assertValidWidgets([a, b])).toThrow(/schon in dieser Szene/);
  });

  it("rejects unknown widget types", () => {
    expect(() =>
      assertValidWidgets([widget({ type: "toaster" })]),
    ).toThrow(/Unbekannter Widget-Typ/);
  });

  it("rejects widgets below their minimum size", () => {
    expect(() => assertValidWidgets([widget({ w: 3 })])).toThrow(
      /mindestens 4 × 3/,
    );
    expect(() =>
      assertValidWidgets([
        widget({ id: "s", type: "school", w: 6, h: 3, props: undefined }),
      ]),
    ).toThrow(/mindestens 6 × 4/);
  });

  it("requires briefing.kind and school mode/mealDay", () => {
    expect(() =>
      assertValidWidgets([
        widget({ type: "briefing", props: undefined }),
      ]),
    ).toThrow(/kind/);
    expect(() =>
      assertValidWidgets([
        widget({
          type: "briefing",
          props: { kind: "someday" as unknown as "today" },
        }),
      ]),
    ).toThrow(/kind/);
    expect(() =>
      assertValidWidgets([
        widget({
          type: "school",
          w: 6,
          h: 4,
          props: { mode: "plan-meal" },
        }),
      ]),
    ).toThrow(/mealDay/);
  });

  it("rejects foreign props on plain widgets", () => {
    expect(() =>
      assertValidWidgets([
        widget({ type: "news", props: { kind: "today" } }),
      ]),
    ).toThrow(/unbekannte Einstellung/);
    expect(() =>
      assertValidWidgets([
        widget({ type: "shopping", props: { wide: true } }),
      ]),
    ).toThrow(/unbekannte Einstellung/);
  });

  it("validates the fallback widget type", () => {
    expect(() =>
      assertValidWidgets([widget({ fallback: "toaster" })]),
    ).toThrow(/Unbekannter Fallback-Typ/);
    expect(() =>
      assertValidWidgets([widget({ fallback: "clock" })]),
    ).toThrow(/eigener Fallback/);
    expect(() =>
      assertValidWidgets([
        widget({
          type: "briefing",
          props: { kind: "today" },
          fallback: "shopping",
        }),
      ]),
    ).not.toThrow();
  });

  it("rejects fallbacks that need their own settings", () => {
    for (const fallback of ["briefing", "school"]) {
      expect(() =>
        assertValidWidgets([widget({ fallback })]),
      ).toThrow(/kein Fallback/);
    }
    expect(() =>
      assertValidWidgets([widget({ fallback: "news" })]),
    ).not.toThrow();
  });
});

describe("assertScheduleCompatible", () => {
  const published = [
    { sceneId: "afternoon", name: "Nachmittag", start: start({ schoolDay: "14:00", weekend: null }) },
    { sceneId: "night", name: "Nacht", start: start({ schoolDay: "21:30", weekend: "21:30" }) },
  ];

  it("accepts a non-conflicting start", () => {
    expect(() =>
      assertScheduleCompatible(
        { sceneId: "s-new", name: "Neu", start: start({ schoolDay: "15:30", weekend: null }) },
        published,
      ),
    ).not.toThrow();
  });

  it("rejects a duplicate school-day start, naming the other scene", () => {
    expect(() =>
      assertScheduleCompatible(
        { sceneId: "s-new", name: "Neu", start: start({ schoolDay: "14:00", weekend: null }) },
        published,
      ),
    ).toThrow(/Um 14:00 startet Mo–Fr schon die Szene Nachmittag/);
  });

  it("rejects a duplicate weekend start", () => {
    expect(() =>
      assertScheduleCompatible(
        { sceneId: "s-new", name: "Neu", start: start({ schoolDay: "15:30", weekend: "21:30" }) },
        published,
      ),
    ).toThrow(/Um 21:30 startet Sa\/So schon die Szene Nacht/);
  });

  it("ignores the candidate's own previous start", () => {
    expect(() =>
      assertScheduleCompatible(
        { sceneId: "afternoon", name: "Nachmittag", start: start({ schoolDay: "14:00", weekend: null }) },
        published,
      ),
    ).not.toThrow();
  });

  it("treats school days and weekends independently", () => {
    expect(() =>
      assertScheduleCompatible(
        { sceneId: "s-new", name: "Neu", start: start({ schoolDay: "15:30", weekend: "14:00" }) },
        published,
      ),
    ).not.toThrow();
  });
});

describe("assertDayTypesCovered", () => {
  it("accepts a schedule with layout scenes on both day types", () => {
    expect(() =>
      assertDayTypesCovered([
        { kind: "layout", start: start({ schoolDay: "06:45", weekend: null }) },
        { kind: "layout", start: start({ schoolDay: null, weekend: "07:30" }) },
        { kind: "night", start: start({ schoolDay: "21:30", weekend: "21:30" }) },
      ]),
    ).not.toThrow();
  });

  it("rejects a day type without a layout scene", () => {
    expect(() =>
      assertDayTypesCovered([
        { kind: "layout", start: start({ schoolDay: "06:45", weekend: null }) },
        { kind: "night", start: start({ schoolDay: "21:30", weekend: "21:30" }) },
      ]),
    ).toThrow(/Sa\/So/);
  });
});

describe("default scenes seed data", () => {
  it("seeds the five current scenes with stable ids", () => {
    expect(DEFAULT_SCENES.map((s) => s.sceneId)).toEqual([
      "morning",
      "day",
      "afternoon",
      "evening",
      "night",
    ]);
  });

  it("validates every seed: name, start and widgets", () => {
    for (const scene of DEFAULT_SCENES) {
      assertValidSceneName(scene.name);
      assertValidStart(scene.start);
      assertValidWidgets(scene.widgets);
    }
  });

  it("forms a conflict-free schedule covering both day types", () => {
    const published = DEFAULT_SCENES.map((s) => ({
      sceneId: s.sceneId,
      name: s.name,
      start: s.start,
    }));
    for (const candidate of published) {
      assertScheduleCompatible(candidate, published);
    }
    assertDayTypesCovered(
      DEFAULT_SCENES.map((s) => ({ kind: s.kind, start: s.start })),
    );
  });

  it("shows weather hints only in the morning", () => {
    for (const scene of DEFAULT_SCENES) {
      for (const widget of scene.widgets) {
        if (widget.type === "clock") {
          expect(widget.props?.hints).toBe(scene.sceneId === "morning");
        }
      }
    }
  });

  it("fills all 24 grid rows", () => {
    for (const scene of DEFAULT_SCENES) {
      if (scene.kind !== "layout") continue;
      const bottom = Math.max(...scene.widgets.map((w) => w.y + w.h));
      expect(bottom).toBe(24);
    }
  });
});

describe("dashboard scenes v1 contract fixture", () => {
  function loadFeed(): ScenesFeed {
    return loadJsonFixture("dashboard-scenes-v1.json") as unknown as ScenesFeed;
  }

  it("matches the real validator (fixture parses against scenesFeedValidator)", () => {
    assertMatchesValidator(
      scenesFeedValidator.json as unknown as ValidatorJson,
      loadJsonFixture("dashboard-scenes-v1.json"),
      "feed",
    );
  });

  it("has the versioned envelope (same keys the live feed serves)", () => {
    const feed = loadJsonFixture("dashboard-scenes-v1.json");
    expect(Object.keys(feed).sort()).toEqual(
      ["grid", "preview", "revision", "scenes", "version"].sort(),
    );
    expect(feed["version"]).toBe(1);
    expect(feed["grid"]).toEqual({ cols: 12, rows: 24 });
    expect(typeof feed["revision"]).toBe("number");
  });

  it("holds valid scenes (names, starts, widgets, conflict-free schedule)", () => {
    const feed = loadFeed();
    for (const scene of feed.scenes) {
      assertValidSceneName(scene.name);
      assertValidStart(scene.start);
      assertValidWidgets(scene.widgets ?? []);
    }
    const published = feed.scenes.map((scene) => ({
      sceneId: scene.id,
      name: scene.name,
      start: scene.start,
    }));
    for (const candidate of published) {
      assertScheduleCompatible(candidate, published);
    }
    assertDayTypesCovered(
      feed.scenes.map((scene) => ({ kind: scene.kind, start: scene.start })),
    );
  });
});
