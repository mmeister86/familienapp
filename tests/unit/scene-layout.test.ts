import { describe, expect, it } from "vitest";
import {
  applyLayoutChange,
  defaultPropsFor,
  firstFreeSpot,
  samePlacements,
  widgetsToLayout,
} from "../../src/lib/scene-layout.js";
import type { SceneWidget } from "../../convex/lib/validators.js";

const catalog = [
  { type: "clock", name: "Uhr & Wetter", minW: 4, minH: 3 },
  { type: "news", name: "Nachrichten", minW: 4, minH: 3 },
];

function widget(overrides: Partial<SceneWidget> = {}): SceneWidget {
  return {
    id: "w1",
    type: "clock",
    x: 0,
    y: 0,
    w: 12,
    h: 4,
    ...overrides,
  };
}

describe("widgetsToLayout", () => {
  it("maps widgets to grid items with catalog minima", () => {
    expect(widgetsToLayout([widget()], catalog)).toEqual([
      { i: "w1", x: 0, y: 0, w: 12, h: 4, minW: 4, minH: 3 },
    ]);
  });

  it("falls back to 1x1 minima for unknown types", () => {
    expect(widgetsToLayout([widget({ type: "toaster" })], catalog)).toEqual([
      { i: "w1", x: 0, y: 0, w: 12, h: 4, minW: 1, minH: 1 },
    ]);
  });
});

describe("applyLayoutChange", () => {
  it("syncs positions and sizes by id", () => {
    const widgets = [widget(), widget({ id: "w2", type: "news" })];
    const got = applyLayoutChange(widgets, [
      { i: "w1", x: 1, y: 2, w: 6, h: 5, minW: 4, minH: 3 },
      { i: "w2", x: 0, y: 0, w: 4, h: 4, minW: 4, minH: 3 },
    ]);
    expect(got).toEqual([
      { ...widgets[0], x: 1, y: 2, w: 6, h: 5 },
      { ...widgets[1], x: 0, y: 0, w: 4, h: 4 },
    ]);
  });

  it("ignores unknown ids and keeps missing widgets", () => {
    const widgets = [widget()];
    const got = applyLayoutChange(widgets, [
      { i: "__dropping", x: 0, y: 4, w: 4, h: 4, minW: 4, minH: 3 },
    ]);
    expect(got).toEqual(widgets);
  });
});

describe("defaultPropsFor", () => {
  it("prefills required settings, nothing else", () => {
    expect(defaultPropsFor("briefing")).toEqual({ kind: "today" });
    expect(defaultPropsFor("school")).toEqual({
      mode: "plan-meal",
      mealDay: "today",
    });
    expect(defaultPropsFor("clock")).toEqual({});
    expect(defaultPropsFor("news")).toEqual({});
  });
});

describe("samePlacements", () => {
  it("ignores order-independent identity and compares geometry", () => {
    const widgets = [widget(), widget({ id: "w2", type: "news" })];
    expect(samePlacements(widgets, widgets)).toBe(true);
    expect(samePlacements(widgets, [widgets[1], widgets[0]])).toBe(true);
    expect(
      samePlacements(widgets, [{ ...widgets[0], x: 1 }, widgets[1]]),
    ).toBe(false);
    expect(samePlacements(widgets, [widgets[0]])).toBe(false);
    expect(samePlacements(widgets, [...widgets, widget({ id: "w3" })])).toBe(
      false,
    );
  });
});

describe("firstFreeSpot", () => {
  it("takes the top-left free rectangle", () => {
    expect(firstFreeSpot([], 4, 4)).toEqual({ x: 0, y: 0 });
    expect(firstFreeSpot([widget()], 4, 4)).toEqual({ x: 0, y: 4 });
    const fullRow = [widget({ x: 0, y: 0, w: 12, h: 4 })];
    expect(firstFreeSpot(fullRow, 6, 4)).toEqual({ x: 0, y: 4 });
  });

  it("returns null when nothing fits", () => {
    const full = [widget({ x: 0, y: 0, w: 12, h: 24 })];
    expect(firstFreeSpot(full, 4, 4)).toBeNull();
    expect(firstFreeSpot([], 13, 4)).toBeNull();
  });
});
