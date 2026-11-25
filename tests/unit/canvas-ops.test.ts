import { describe, expect, it } from "vitest";
import type { SceneWidget } from "../../convex/lib/validators.js";
import {
  applyDrop,
  isValidLayout,
  minimaFrom,
  placeFree,
  planClickAdd,
  planDrop,
  splitTile,
  tileAt,
  type Minima,
} from "../../src/lib/canvas-ops.js";

function w(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
): SceneWidget {
  return { id, type, x, y, w: width, h: height } as SceneWidget;
}

const sizes: Record<string, [number, number]> = {
  clock: [4, 3],
  shopping: [4, 2],
  news: [4, 3],
  school: [6, 4],
  dayband: [8, 4],
  week: [6, 5],
};
const minima: Minima = (type) => {
  const s = sizes[type] ?? [1, 1];
  return { minW: s[0], minH: s[1] };
};

const afternoon = (): SceneWidget[] => [
  w("clock", "clock", 0, 0, 12, 3),
  w("dayband", "dayband", 0, 3, 12, 4),
  w("school", "school", 0, 7, 12, 8),
  w("week", "week", 0, 15, 12, 7),
  w("shopping", "shopping", 0, 22, 12, 2),
];

describe("minimaFrom", () => {
  it("reads the catalog and defaults unknown types to 1x1", () => {
    const m = minimaFrom([{ type: "clock", name: "Uhr", minW: 4, minH: 3 }]);
    expect(m("clock")).toEqual({ minW: 4, minH: 3 });
    expect(m("other")).toEqual({ minW: 1, minH: 1 });
  });
});

describe("isValidLayout", () => {
  it("accepts the afternoon scene", () => {
    expect(isValidLayout(afternoon(), minima)).toBe(true);
  });
  it("rejects overlaps, overflow and undersized tiles", () => {
    expect(
      isValidLayout([w("a", "x", 0, 0, 4, 4), w("b", "x", 3, 3, 4, 4)], minima),
    ).toBe(false);
    expect(isValidLayout([w("a", "x", 9, 0, 4, 4)], minima)).toBe(false);
    expect(isValidLayout([w("a", "clock", 0, 0, 3, 3)], minima)).toBe(false);
  });
});

describe("tileAt", () => {
  it("finds the covering tile or undefined", () => {
    const ws = afternoon();
    expect(tileAt(ws, { col: 5, row: 9 })?.id).toBe("school");
    expect(tileAt([w("a", "x", 0, 0, 2, 2)], { col: 5, row: 5 })).toBe(
      undefined,
    );
  });
});

describe("placeFree", () => {
  const size = { minW: 4, minH: 3 };
  it("anchors at the cell on an empty grid", () => {
    expect(placeFree([], size, { col: 5, row: 10 })).toEqual({
      x: 5,
      y: 10,
      w: 4,
      h: 3,
    });
  });
  it("pulls the rectangle inside the grid", () => {
    expect(placeFree([], size, { col: 11, row: 23 })).toEqual({
      x: 8,
      y: 21,
      w: 4,
      h: 3,
    });
  });
  it("places right below a tile", () => {
    expect(
      placeFree([w("a", "x", 0, 0, 12, 10)], size, { col: 2, row: 10 }),
    ).toEqual({ x: 2, y: 10, w: 4, h: 3 });
  });
  it("returns null when only a 3-wide column is free", () => {
    expect(
      placeFree([w("a", "x", 3, 0, 9, 24)], size, { col: 1, row: 5 }),
    ).toBeNull();
  });
  it("shifts to the nearest free position containing the cell", () => {
    // blocked at x 5..8 by a tile at x 8; shifting left by one (x 4) is free
    expect(
      placeFree([w("a", "x", 8, 0, 4, 24)], size, { col: 7, row: 5 }),
    ).toEqual({ x: 4, y: 5, w: 4, h: 3 });
  });
  it("prefers a horizontal shift over a vertical one on ties", () => {
    // anchored (5,5) blocked by a 1x1 tile at (6,5); left 1 and up 1 both free
    expect(
      placeFree([w("a", "x", 6, 6, 1, 1)], { minW: 2, minH: 2 }, {
        col: 5,
        row: 5,
      }),
    ).toEqual({ x: 4, y: 5, w: 2, h: 2 });
  });
});

describe("splitTile", () => {
  const school = w("school", "school", 0, 7, 12, 8);
  const added = { minW: 4, minH: 3 };
  const schoolMin = { minW: 6, minH: 4 };
  it("splits right and bottom", () => {
    expect(splitTile(school, "right", added, schoolMin)).toEqual({
      target: { x: 0, y: 7, w: 6, h: 8 },
      added: { x: 6, y: 7, w: 6, h: 8 },
    });
    expect(splitTile(school, "bottom", added, schoolMin)).toEqual({
      target: { x: 0, y: 7, w: 12, h: 4 },
      added: { x: 0, y: 11, w: 12, h: 4 },
    });
  });
  it("splits left and top", () => {
    expect(splitTile(school, "left", added, schoolMin)).toEqual({
      target: { x: 6, y: 7, w: 6, h: 8 },
      added: { x: 0, y: 7, w: 6, h: 8 },
    });
    expect(splitTile(school, "top", added, schoolMin)).toEqual({
      target: { x: 0, y: 11, w: 12, h: 4 },
      added: { x: 0, y: 7, w: 12, h: 4 },
    });
  });
  it("returns null when the target cannot give enough", () => {
    expect(
      splitTile(w("t", "week", 0, 0, 6, 5), "right", added, {
        minW: 4,
        minH: 3,
      }),
    ).toBeNull();
  });
  it("gives the added tile its minimum when more than half", () => {
    expect(
      splitTile(
        w("t", "x", 0, 0, 9, 4),
        "right",
        { minW: 6, minH: 4 },
        { minW: 3, minH: 1 },
      ),
    ).toEqual({
      target: { x: 0, y: 0, w: 3, h: 4 },
      added: { x: 3, y: 0, w: 6, h: 4 },
    });
  });
  it("returns null when the added minimum exceeds the cross axis", () => {
    expect(
      splitTile(
        w("t", "x", 0, 0, 12, 3),
        "right",
        { minW: 4, minH: 4 },
        { minW: 1, minH: 1 },
      ),
    ).toBeNull();
  });
});

describe("planDrop", () => {
  it("splits right near the right edge of a tile", () => {
    const plan = planDrop(afternoon(), "news", { x: 10.5, y: 9.0 }, minima);
    expect(plan).toMatchObject({
      kind: "split",
      targetId: "school",
      side: "right",
    });
  });
  it("splits bottom near the bottom edge", () => {
    const plan = planDrop(afternoon(), "news", { x: 6.0, y: 14.6 }, minima);
    expect(plan).toMatchObject({
      kind: "split",
      targetId: "school",
      side: "bottom",
    });
  });
  it("is blocked inside a strip that cannot be split", () => {
    expect(planDrop(afternoon(), "news", { x: 6, y: 23 }, minima)).toEqual({
      kind: "blocked",
    });
  });
  it("places on an empty grid", () => {
    const plan = planDrop([], "news", { x: 5.2, y: 10.7 }, minima);
    expect(plan).toEqual({
      kind: "place",
      added: placeFree([], minima("news"), { col: 5, row: 10 }),
    });
  });
  it("falls through to the possible axis", () => {
    const ws = [w("t", "school", 0, 0, 10, 11)];
    expect(planDrop(ws, "week", { x: 0.5, y: 2.0 }, minima)).toEqual({
      kind: "split",
      targetId: "t",
      side: "top",
      added: { x: 0, y: 0, w: 10, h: 5 },
      target: { x: 0, y: 5, w: 10, h: 6 },
    });
    expect(planDrop(ws, "week", { x: 0.5, y: 9.5 }, minima)).toEqual({
      kind: "split",
      targetId: "t",
      side: "bottom",
      added: { x: 0, y: 6, w: 10, h: 5 },
      target: { x: 0, y: 0, w: 10, h: 6 },
    });
  });
});

describe("planClickAdd", () => {
  it("places at the first free spot", () => {
    expect(planClickAdd([w("a", "x", 0, 0, 12, 2)], "news", minima)).toEqual({
      kind: "place",
      added: { x: 0, y: 2, w: 4, h: 3 },
    });
  });
  it("splits the largest splittable tile on a full scene", () => {
    expect(planClickAdd(afternoon(), "news", minima)).toMatchObject({
      kind: "split",
      targetId: "school",
      side: "bottom",
    });
  });
  it("chooses the split whose smaller part is larger", () => {
    const full = [w("t", "x", 0, 0, 12, 24)];
    // 12x24: bottom and right both leave 144 as the smaller part: tie -> bottom
    expect(planClickAdd(full, "news", minima)).toMatchObject({ side: "bottom" });
    // 12x4 above an unsplittable filler: bottom leaves 12, right leaves 24
    const m: Minima = (t) =>
      t === "filler" ? { minW: 12, minH: 20 } : minima(t);
    expect(
      planClickAdd(
        [w("t", "x", 0, 0, 12, 4), w("f", "filler", 0, 4, 12, 20)],
        "news",
        m,
      ),
    ).toMatchObject({ targetId: "t", side: "right" });
  });
  it("is blocked when nothing can be split", () => {
    expect(
      planClickAdd([w("a", "x", 0, 0, 12, 24)], "dayband", (t) =>
        t === "dayband" ? { minW: 13, minH: 1 } : { minW: 1, minH: 1 },
      ),
    ).toEqual({ kind: "blocked" });
  });
});

describe("applyDrop", () => {
  it("inserts the new widget and shrinks the target without mutation", () => {
    const base = afternoon().map((x, i) =>
      i === 2 ? ({ ...x, props: { mode: "plan-meal" }, fallback: "x" } as SceneWidget) : x,
    );
    const copy = structuredClone(base);
    const plan = planDrop(base, "news", { x: 10.5, y: 9.0 }, minima);
    const result = applyDrop(base, plan, { id: "n1", type: "news" });
    expect(base).toEqual(copy);
    expect(result).not.toBeNull();
    const added = result?.find((x) => x.id === "n1");
    expect(added).toMatchObject({ type: "news", x: 6, y: 7, w: 6, h: 8 });
    expect(result?.find((x) => x.id === "school")).toEqual({
      ...base[2],
      w: 6,
    });
    expect(isValidLayout(result ?? [], minima)).toBe(true);
  });
  it("returns null for a blocked plan", () => {
    expect(
      applyDrop([], { kind: "blocked" }, { id: "n", type: "news" }),
    ).toBeNull();
  });
});
