import { GRID } from "../../lib/canvas-ops"

export type GridBox = { left: number; top: number; width: number; height: number }

/** Pointer position in grid units (with fractions), clamped to the grid. */
export function pointToGrid(
  clientX: number,
  clientY: number,
  box: GridBox,
): { x: number; y: number } {
  const clamp = (value: number, max: number): number =>
    Math.min(max, Math.max(0, value))
  return {
    x: clamp(((clientX - box.left) / box.width) * GRID.cols, GRID.cols),
    y: clamp(((clientY - box.top) / box.height) * GRID.rows, GRID.rows),
  }
}

/** Whole cells moved between two pixel positions; half a cell switches. */
export function deltaCells(startPx: number, nowPx: number, cellPx: number): number {
  return Math.round((nowPx - startPx) / cellPx) || 0
}
