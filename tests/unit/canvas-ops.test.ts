import { describe, expect, it } from "vitest";
import type { SceneWidget } from "../../convex/lib/validators.js";
import {
  applyDrop,
  isValidLayout,
  minimaFrom,
  moveTile,
  placeFree,
  planClickAdd,
  planDrop,
  planMove,
  removeTile,
  resizeTile,
  splitTile,
  tileAt,
  type Edge,
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

const clone = (l: SceneWidget[]) => JSON.parse(JSON.stringify(l)) as SceneWidget[];
const rect = (l: SceneWidget[] | null, id: string) => {
  const t = l?.find((x) => x.id === id);
  return t && [t.x, t.y, t.w, t.h];
};
// "clock" minimum is 4x3, "shopping" 4x2; "tile" defaults to 1x1.
const resize = (
  l: SceneWidget[],
  id: string,
  edges: Edge[],
  dx: number,
  dy: number,
) => {
  const before = clone(l);
  const out = resizeTile(l, id, edges, { dx, dy }, minima);
  expect(l).toEqual(before);
  expect(isValidLayout(out, minima)).toBe(true);
  return out;
};

describe("moveTile", () => {
  const base = () => [w("a", "tile", 0, 0, 3, 3), w("b", "tile", 6, 0, 3, 3)];
  it("moves to a free cell", () => {
    expect(rect(moveTile(base(), "a", { col: 2, row: 4 }), "a")).toEqual([2, 4, 3, 3]);
  });
  it("clamps into the grid", () => {
    expect(rect(moveTile(base(), "a", { col: 20, row: 30 }), "a")).toEqual([9, 21, 3, 3]);
    expect(rect(moveTile(base(), "a", { col: -4, row: -1 }), "a")).toEqual([0, 0, 3, 3]);
  });
  it("returns null onto another tile", () => {
    expect(moveTile(base(), "a", { col: 5, row: 1 })).toBeNull();
  });
  it("does not block itself", () => {
    expect(rect(moveTile(base(), "a", { col: 1, row: 0 }), "a")).toEqual([1, 0, 3, 3]);
  });
  it("keeps the list equal when the position is unchanged and does not mutate", () => {
    const l = base();
    const before = clone(l);
    expect(moveTile(l, "a", { col: 0, row: 0 })).toEqual(before);
    expect(l).toEqual(before);
  });
  it("returns null for an unknown id", () => {
    expect(moveTile(base(), "zz", { col: 0, row: 0 })).toBeNull();
  });
});

describe("planMove", () => {
  const news = (): SceneWidget =>
    ({ ...w("news", "news", 0, 0, 4, 3), props: { n: 1 }, fallback: { kind: "hide" } }) as SceneWidget;
  const layoutA = (): SceneWidget[] => [news(), w("school", "school", 0, 5, 12, 8)];
  const cellOf = (p: { x: number; y: number }) => ({ col: Math.floor(p.x), row: Math.floor(p.y) });

  it("splits the tile under the pointer near its right edge", () => {
    const l = layoutA();
    const before = clone(l);
    const point = { x: 10.5, y: 9.0 };
    const plan = planMove(l, "news", cellOf(point), point, minima);
    expect(l).toEqual(before);
    if (plan.kind !== "split") throw new Error(plan.kind);
    expect(plan.side).toBe("right");
    expect(plan.targetId).toBe("school");
    expect(plan.added).toEqual({ x: 6, y: 5, w: 6, h: 8 });
    expect(rect(plan.widgets, "school")).toEqual([0, 5, 6, 8]);
    expect(rect(plan.widgets, "news")).toEqual([6, 5, 6, 8]);
    expect(plan.widgets.map((t) => t.id)).toEqual(["news", "school"]);
    const moved = plan.widgets[0] as SceneWidget;
    expect(moved.props).toEqual({ n: 1 });
    expect(moved.fallback).toEqual({ kind: "hide" });
    expect(moved.type).toBe("news");
    expect(isValidLayout(plan.widgets, minima)).toBe(true);
    expect(tileAt(plan.widgets, { col: 0, row: 0 })).toBeUndefined();
  });

  it("splits near the bottom edge", () => {
    const point = { x: 6.0, y: 12.6 };
    const plan = planMove(layoutA(), "news", cellOf(point), point, minima);
    if (plan.kind !== "split") throw new Error(plan.kind);
    expect(plan.side).toBe("bottom");
    expect(rect(plan.widgets, "school")).toEqual([0, 5, 12, 4]);
    expect(rect(plan.widgets, "news")).toEqual([0, 9, 12, 4]);
  });

  it("keeps untouched tiles by identity", () => {
    const l = [...layoutA(), w("other", "shopping", 0, 20, 4, 2)];
    const point = { x: 10.5, y: 9.0 };
    const plan = planMove(l, "news", cellOf(point), point, minima);
    expect(plan.kind).toBe("split");
    if (plan.kind === "blocked") return;
    expect(plan.widgets[2]).toBe(l[2]);
  });

  it("is blocked when no split fits and reports the pointer cell", () => {
    const l = [w("n", "news", 0, 0, 4, 3), w("shop", "shopping", 0, 22, 12, 2)];
    const before = clone(l);
    const point = { x: 5.5, y: 22.5 };
    const plan = planMove(l, "n", { col: 5, row: 22 }, point, minima);
    expect(plan).toEqual({ kind: "blocked", rect: { x: 5, y: 22, w: 1, h: 1 } });
    expect(l).toEqual(before);
  });

  it("is blocked when the dragged type fits no split of the target", () => {
    const l = [w("d", "dayband", 0, 0, 8, 4), w("t", "tile", 0, 6, 6, 8)];
    const point = { x: 3, y: 10 };
    expect(planMove(l, "d", cellOf(point), point, minima).kind).toBe("blocked");
  });

  it("moves plainly over a free cell", () => {
    const point = { x: 5.2, y: 1.0 };
    const plan = planMove(layoutA(), "news", { col: 5, row: 0 }, point, minima);
    if (plan.kind !== "move") throw new Error(plan.kind);
    expect(rect(plan.widgets, "news")).toEqual([5, 0, 4, 3]);
    expect((plan.widgets[0] as SceneWidget).fallback).toEqual({ kind: "hide" });
  });

  it("over its own original area the layout stays equal", () => {
    const l = layoutA();
    const point = { x: 1.5, y: 1.5 };
    const plan = planMove(l, "news", { col: 0, row: 0 }, point, minima);
    if (plan.kind !== "move") throw new Error(plan.kind);
    expect(plan.widgets).toEqual(l);
  });

  it("blocks a plain move that overlaps and returns the attempted rectangle", () => {
    const l = [w("news", "news", 0, 0, 4, 3), w("clock", "clock", 4, 0, 8, 3)];
    const plan = planMove(l, "news", { col: 2, row: 1 }, { x: 2.0, y: 4.0 }, minima);
    expect(plan).toEqual({ kind: "blocked", rect: { x: 2, y: 1, w: 4, h: 3 } });
  });

  it("clamps the attempted rectangle into the grid", () => {
    const l = [w("news", "news", 0, 0, 4, 3), w("clock", "clock", 8, 20, 4, 3)];
    const plan = planMove(l, "news", { col: 20, row: 30 }, { x: 5.5, y: 1.5 }, minima);
    expect(plan).toEqual({ kind: "blocked", rect: { x: 8, y: 21, w: 4, h: 3 } });
  });

  it("is blocked at the pointer cell for an unknown id", () => {
    expect(planMove(layoutA(), "zz", { col: 0, row: 0 }, { x: 12, y: 24 }, minima)).toEqual({
      kind: "blocked",
      rect: { x: 11, y: 23, w: 1, h: 1 },
    });
  });
});

describe("resizeTile growing", () => {
  it("takes free space on the right", () => {
    const out = resize([w("a", "tile", 0, 0, 6, 5)], "a", ["e"], 3, 0);
    expect(rect(out, "a")).toEqual([0, 0, 9, 5]);
  });
  it("pushes a neighbour and stops at its minimum", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "clock", 6, 0, 6, 5)];
    const one = resize(l, "a", ["e"], 1, 0);
    expect(rect(one, "a")).toEqual([0, 0, 7, 5]);
    expect(rect(one, "b")).toEqual([7, 0, 5, 5]);
    const five = resize(l, "a", ["e"], 5, 0);
    expect(rect(five, "a")).toEqual([0, 0, 8, 5]);
    expect(rect(five, "b")).toEqual([8, 0, 4, 5]);
  });
  it("pushes a partly overlapping neighbour the same way", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "clock", 6, 3, 6, 5)];
    const out = resize(l, "a", ["e"], 5, 0);
    expect(rect(out, "a")).toEqual([0, 0, 8, 5]);
    expect(rect(out, "b")).toEqual([8, 3, 4, 5]);
  });
  it("takes a free gap first, then pushes to the minimum", () => {
    const l = [w("a", "tile", 0, 0, 4, 5), w("b", "clock", 6, 0, 6, 5)];
    const out = resize(l, "a", ["e"], 5, 0);
    expect(rect(out, "a")).toEqual([0, 0, 8, 5]);
    expect(rect(out, "b")).toEqual([8, 0, 4, 5]);
  });
  it("stops at the grid edge", () => {
    const out = resize([w("a", "tile", 0, 0, 10, 5)], "a", ["e"], 5, 0);
    expect(rect(out, "a")).toEqual([0, 0, 12, 5]);
  });
  it("grows south, pushing", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "clock", 0, 5, 6, 6)];
    const out = resize(l, "a", ["s"], 0, 5);
    expect(rect(out, "a")).toEqual([0, 0, 6, 8]);
    expect(rect(out, "b")).toEqual([0, 8, 6, 3]);
  });
  it("grows west keeping the far edge and pushing", () => {
    const l = [w("b", "clock", 0, 0, 6, 5), w("a", "tile", 6, 0, 6, 5)];
    const out = resize(l, "a", ["w"], -5, 0);
    expect(rect(out, "a")).toEqual([4, 0, 8, 5]);
    expect(rect(out, "b")).toEqual([0, 0, 4, 5]);
  });
  it("grows north keeping the far edge and pushing", () => {
    const l = [w("b", "clock", 0, 0, 6, 6), w("a", "tile", 0, 6, 6, 5)];
    const out = resize(l, "a", ["n"], 0, -5);
    expect(rect(out, "a")).toEqual([0, 3, 6, 8]);
    expect(rect(out, "b")).toEqual([0, 0, 6, 3]);
  });
  it("does nothing when the neighbour is already at its minimum", () => {
    const l = [w("a", "tile", 0, 0, 8, 5), w("b", "clock", 8, 0, 4, 5)];
    expect(resize(l, "a", ["e"], 2, 0)).toEqual(l);
  });
  it("applies both edges of a corner", () => {
    const out = resize([w("a", "tile", 0, 0, 3, 3)], "a", ["s", "e"], 1, 1);
    expect(rect(out, "a")).toEqual([0, 0, 4, 4]);
  });
  it("ignores deltas of edges not listed", () => {
    const out = resize([w("a", "tile", 0, 0, 3, 3)], "a", ["e"], 1, 4);
    expect(rect(out, "a")).toEqual([0, 0, 4, 3]);
  });
});

describe("resizeTile shrinking", () => {
  it("lets a flush neighbour within the extent follow", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "tile", 6, 0, 6, 5)];
    const out = resize(l, "a", ["e"], -2, 0);
    expect(rect(out, "a")).toEqual([0, 0, 4, 5]);
    expect(rect(out, "b")).toEqual([4, 0, 8, 5]);
  });
  it("leaves a taller neighbour alone", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "tile", 6, 0, 6, 8)];
    const out = resize(l, "a", ["e"], -2, 0);
    expect(rect(out, "a")).toEqual([0, 0, 4, 5]);
    expect(rect(out, "b")).toEqual([6, 0, 6, 8]);
  });
  it("lets several followers follow", () => {
    const l = [
      w("a", "tile", 0, 0, 6, 5),
      w("c", "tile", 6, 0, 6, 2),
      w("d", "tile", 6, 2, 6, 3),
    ];
    const out = resize(l, "a", ["e"], -2, 0);
    expect(rect(out, "c")).toEqual([4, 0, 8, 2]);
    expect(rect(out, "d")).toEqual([4, 2, 8, 3]);
  });
  it("never goes below the minimum", () => {
    const out = resize([w("a", "clock", 0, 0, 6, 5)], "a", ["e"], -10, 0);
    expect(rect(out, "a")).toEqual([0, 0, 4, 5]);
  });
  it("shrinks the west edge and lets the left follower follow", () => {
    const l = [w("b", "tile", 0, 0, 6, 5), w("a", "tile", 6, 0, 6, 5)];
    const out = resize(l, "a", ["w"], 2, 0);
    expect(rect(out, "a")).toEqual([8, 0, 4, 5]);
    expect(rect(out, "b")).toEqual([0, 0, 8, 5]);
  });
  it("shrinks the south edge and lets the follower below follow", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "tile", 0, 5, 6, 5)];
    const out = resize(l, "a", ["s"], 0, -2);
    expect(rect(out, "a")).toEqual([0, 0, 6, 3]);
    expect(rect(out, "b")).toEqual([0, 3, 6, 7]);
  });
});

describe("resizeTile corners", () => {
  it("decides the second edge's followers from the layout after the first", () => {
    const l = [
      w("a", "tile", 0, 0, 6, 5),
      w("c", "tile", 6, 0, 6, 5),
      w("b", "tile", 0, 5, 6, 5),
    ];
    const out = resize(l, "a", ["s", "e"], -2, -2);
    expect(rect(out, "a")).toEqual([0, 0, 4, 3]);
    expect(rect(out, "c")).toEqual([4, 0, 8, 5]);
    expect(rect(out, "b")).toEqual([0, 5, 6, 5]);
  });
  it("mirrors for west and north", () => {
    const l = [
      w("a", "tile", 6, 5, 6, 5),
      w("l", "tile", 0, 5, 6, 5),
      w("t", "tile", 6, 0, 6, 5),
    ];
    const out = resize(l, "a", ["w", "n"], 2, 2);
    expect(rect(out, "a")).toEqual([8, 7, 4, 3]);
    expect(rect(out, "l")).toEqual([0, 5, 8, 5]);
    expect(rect(out, "t")).toEqual([6, 0, 6, 5]);
  });
  it("mixes growing and shrinking", () => {
    const l = [
      w("a", "tile", 0, 0, 6, 5),
      w("c", "tile", 6, 0, 6, 5),
      w("b", "clock", 0, 5, 6, 6),
    ];
    const out = resize(l, "a", ["e", "s"], -2, 2);
    expect(rect(out, "a")).toEqual([0, 0, 4, 7]);
    expect(rect(out, "c")).toEqual([4, 0, 8, 5]);
    expect(rect(out, "b")).toEqual([0, 7, 6, 4]);
  });
});

describe("removeTile", () => {
  it("fills with the single flush neighbour", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "tile", 6, 0, 6, 5)];
    const out = removeTile(l, "a");
    expect(out).toEqual([w("b", "tile", 0, 0, 12, 5)]);
    expect(l).toHaveLength(2);
  });
  it("grows two tiles that together cover a side", () => {
    const l = [
      w("a", "tile", 0, 0, 6, 5),
      w("b", "tile", 6, 0, 6, 2),
      w("c", "tile", 6, 2, 6, 3),
    ];
    const out = removeTile(l, "a");
    expect(rect(out, "b")).toEqual([0, 0, 12, 2]);
    expect(rect(out, "c")).toEqual([0, 2, 12, 3]);
  });
  it("prefers the side with fewer tiles (left over top)", () => {
    const l = [
      w("l", "tile", 0, 3, 3, 4),
      w("x", "tile", 3, 3, 4, 4),
      w("t1", "tile", 3, 0, 2, 3),
      w("t2", "tile", 5, 0, 2, 3),
    ];
    const out = removeTile(l, "x");
    expect(rect(out, "l")).toEqual([0, 3, 7, 4]);
    expect(rect(out, "t1")).toEqual([3, 0, 2, 3]);
  });
  it("breaks ties as left, top, right, bottom", () => {
    const l = [
      w("t", "tile", 3, 0, 4, 3),
      w("x", "tile", 3, 3, 4, 4),
      w("r", "tile", 7, 3, 4, 4),
    ];
    const out = removeTile(l, "x");
    expect(rect(out, "t")).toEqual([3, 0, 4, 7]);
    expect(rect(out, "r")).toEqual([7, 3, 4, 4]);
  });
  it("keeps the gap when a neighbour is longer than the side", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "tile", 6, 0, 6, 8)];
    expect(removeTile(l, "a")).toEqual([l[1]]);
    expect(removeTile(l, "a")[0]).toBe(l[1]);
  });
  it("keeps the gap when the side has holes", () => {
    const l = [w("a", "tile", 0, 0, 6, 5), w("b", "tile", 6, 0, 6, 2)];
    expect(rect(removeTile(l, "a"), "b")).toEqual([6, 0, 6, 2]);
  });
  it("removes the only tile and ignores unknown ids", () => {
    expect(removeTile([w("a", "tile", 0, 0, 6, 5)], "a")).toEqual([]);
    const l = [w("a", "tile", 0, 0, 6, 5)];
    expect(removeTile(l, "zz")).toEqual(l);
  });
});

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("random operations keep the layout valid", () => {
  const starts: Record<string, () => SceneWidget[]> = {
    afternoon,
    scattered: () => [
      w("s1", "clock", 1, 1, 5, 4),
      w("s2", "shopping", 7, 6, 4, 3),
      w("s3", "week", 2, 12, 8, 6),
    ],
  };
  for (const [name, start] of Object.entries(starts)) {
    it(`from ${name}`, () => {
     for (const seed of [1, 2, 3, 12345, 987654]) {
      const rnd = seeded(seed);
      const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
      const edgeSets: Edge[][] = [
        ["n"], ["e"], ["s"], ["w"],
        ["s", "e"], ["n", "w"], ["n", "e"], ["s", "w"],
      ];
      let layout = start();
      expect(isValidLayout(layout, minima)).toBe(true);
      for (let i = 0; i < 300; i++) {
        if (layout.length === 0) {
          layout = start();
        }
        const id = layout[int(0, layout.length - 1)].id;
        const before = clone(layout);
        const op = rnd();
        let next: SceneWidget[] | null;
        if (op < 0.4) {
          next = moveTile(layout, id, { col: int(-2, 13), row: int(-2, 25) });
        } else if (op < 0.65) {
          const point = { x: rnd() * 12, y: rnd() * 24 };
          const plan = planMove(
            layout,
            id,
            { col: Math.floor(point.x) + int(-3, 3), row: Math.floor(point.y) + int(-3, 3) },
            point,
            minima,
          );
          next = plan.kind === "blocked" ? null : plan.widgets;
        } else if (op < 0.9) {
          next = resizeTile(
            layout,
            id,
            edgeSets[int(0, edgeSets.length - 1)],
            { dx: int(-6, 6), dy: int(-6, 6) },
            minima,
          );
        } else {
          next = removeTile(layout, id);
        }
        expect(layout).toEqual(before);
        if (next) {
          expect(isValidLayout(next, minima)).toBe(true);
          layout = next;
        }
      }
     }
    });
  }
});
