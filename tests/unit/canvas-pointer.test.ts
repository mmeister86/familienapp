import { describe, expect, it } from "vitest";
import { clampOffset, deltaCells, pointToGrid, rectToBox } from "../../src/components/layouts/canvas-pointer.js";

const box = { left: 100, top: 50, width: 600, height: 1066 };

describe("pointToGrid", () => {
  it("maps the top-left pixel to the origin", () => {
    expect(pointToGrid(100, 50, box)).toEqual({ x: 0, y: 0 });
  });
  it("maps the centre to the middle of the grid", () => {
    expect(pointToGrid(400, 583, box)).toEqual({ x: 6, y: 12 });
  });
  it("clamps points above and left of the box", () => {
    expect(pointToGrid(0, 0, box)).toEqual({ x: 0, y: 0 });
  });
  it("clamps points beyond the bottom right", () => {
    expect(pointToGrid(5000, 5000, box)).toEqual({ x: 12, y: 24 });
  });
});

describe("deltaCells", () => {
  it("stays put below half a cell", () => {
    expect(deltaCells(0, 24, 50)).toBe(0);
  });
  it("switches past half a cell", () => {
    expect(deltaCells(0, 26, 50)).toBe(1);
  });
  it("rounds negative movement", () => {
    expect(deltaCells(0, -76, 50)).toBe(-2);
  });
});

describe("rectToBox", () => {
  const area = { width: 600, height: 1066 };
  const gap = 6;
  const near = (a: number, b: number): void => expect(a).toBeCloseTo(b, 3);

  it("maps the full grid to the whole area", () => {
    expect(rectToBox({ x: 0, y: 0, w: 12, h: 24 }, gap, area)).toEqual({
      left: 0,
      top: 0,
      width: 600,
      height: 1066,
    });
  });
  it("maps a single cell to one column and one row", () => {
    const box = rectToBox({ x: 0, y: 0, w: 1, h: 1 }, gap, area);
    near(box.width, 44.5);
    near(box.height, (1066 - 138) / 24);
  });
  it("offsets by whole columns, rows and gaps", () => {
    const box = rectToBox({ x: 6, y: 12, w: 6, h: 12 }, gap, area);
    near(box.left, 303);
    near(box.top, 12 * ((1066 - 138) / 24 + 6));
    near(box.width, 297);
    near(box.height, 12 * ((1066 - 138) / 24) + 66);
  });
  it("ends flush with the right and bottom edges", () => {
    const right = rectToBox({ x: 6, y: 0, w: 6, h: 1 }, gap, area);
    near(right.left + right.width, 600);
    const bottom = rectToBox({ x: 0, y: 12, w: 1, h: 12 }, gap, area);
    near(bottom.top + bottom.height, 1066);
  });
});

describe("clampOffset", () => {
  const area = { width: 600, height: 1000 };
  const tile = { left: 0, top: 0, width: 100, height: 200 };

  it("keeps a tile at the left edge from moving further left", () => {
    expect(clampOffset(tile, -50, 30, area)).toEqual({ dx: 0, dy: 30 });
  });
  it("keeps a tile at the top edge from moving further up", () => {
    expect(clampOffset(tile, 20, -50, area)).toEqual({ dx: 20, dy: 0 });
  });
  it("stops flush at the right and bottom edges", () => {
    expect(clampOffset(tile, 9999, 9999, area)).toEqual({ dx: 500, dy: 800 });
  });
  it("allows moving back from an inner position up to the edges", () => {
    const inner = { left: 300, top: 400, width: 100, height: 200 };
    expect(clampOffset(inner, -9999, 9999, area)).toEqual({ dx: -300, dy: 400 });
    expect(clampOffset(inner, 10, -20, area)).toEqual({ dx: 10, dy: -20 });
  });
});
