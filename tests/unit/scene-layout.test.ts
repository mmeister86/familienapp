import { describe, expect, it } from "vitest";
import {
  defaultPropsFor,
  firstFreeSpot,
  headerPalette,
  sameWidgets,
} from "../../src/lib/scene-layout.js";
import type { SceneWidget } from "../../convex/lib/validators.js";

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

describe("sameWidgets", () => {
  const widgets = [
    widget({ props: { kind: "today" } }),
    widget({ id: "w2", type: "news", x: 0, y: 4, w: 6, h: 3, fallback: "clock" }),
  ];

  it("is true for equal lists in any order", () => {
    expect(sameWidgets(widgets, widgets.map((w) => ({ ...w })))).toBe(true);
    expect(sameWidgets(widgets, [widgets[1], widgets[0]])).toBe(true);
  });

  it("is false for a moved or resized tile", () => {
    expect(sameWidgets(widgets, [{ ...widgets[0], x: 1 }, widgets[1]])).toBe(false);
    expect(sameWidgets(widgets, [widgets[0], { ...widgets[1], h: 4 }])).toBe(false);
  });

  it("is false for a changed prop or fallback", () => {
    expect(
      sameWidgets(widgets, [{ ...widgets[0], props: { kind: "tomorrow" } }, widgets[1]]),
    ).toBe(false);
    expect(sameWidgets(widgets, [widgets[0], { ...widgets[1], fallback: "news" }])).toBe(false);
    const bare = { ...widgets[1] };
    delete bare.fallback;
    expect(sameWidgets(widgets, [widgets[0], bare])).toBe(false);
  });

  it("is false for a missing or extra tile", () => {
    expect(sameWidgets(widgets, [widgets[0]])).toBe(false);
    expect(sameWidgets(widgets, [...widgets, widget({ id: "w3" })])).toBe(false);
  });

  it("tells props undefined from empty props", () => {
    expect(
      sameWidgets([widget({ props: undefined })], [widget({ props: {} })]),
    ).toBe(false);
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

describe("headerPalette", () => {
  it("lets the form win, even when it unset the palette", () => {
    expect(
      headerPalette({ palette: undefined }, { palette: "board" }),
    ).toBeUndefined();
    expect(headerPalette({ palette: "paper" }, { palette: "board" })).toBe(
      "paper",
    );
  });

  it("falls back to the published stand without a form", () => {
    expect(headerPalette(null, { palette: "board" })).toBe("board");
    expect(headerPalette(null, null)).toBeUndefined();
    expect(headerPalette(null, undefined)).toBeUndefined();
  });
});
