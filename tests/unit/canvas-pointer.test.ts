import { describe, expect, it } from "vitest";
import { deltaCells, pointToGrid } from "../../src/components/layouts/canvas-pointer.js";

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
