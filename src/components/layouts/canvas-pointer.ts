import { GRID, type Rect } from "../../lib/canvas-ops"

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

/**
 * A grid rectangle in pixels inside an area, matching the dashed background:
 * 12 columns and 24 rows separated by `gapPx`.
 */
export function rectToBox(
  rect: Rect,
  gapPx: number,
  area: { width: number; height: number },
): GridBox {
  const colPx = (area.width - (GRID.cols - 1) * gapPx) / GRID.cols
  const rowPx = (area.height - (GRID.rows - 1) * gapPx) / GRID.rows
  return {
    left: rect.x * (colPx + gapPx),
    top: rect.y * (rowPx + gapPx),
    width: rect.w * colPx + (rect.w - 1) * gapPx,
    height: rect.h * rowPx + (rect.h - 1) * gapPx,
  }
}

/** Limits a drag offset so the dragged box stays inside the area. */
export function clampOffset(
  startBox: GridBox,
  dx: number,
  dy: number,
  area: { width: number; height: number },
): { dx: number; dy: number } {
  const limit = (delta: number, start: number, size: number, extent: number): number =>
    Math.min(Math.max(delta, -start), Math.max(extent - start - size, -start)) + 0
  return {
    dx: limit(dx, startBox.left, startBox.width, area.width),
    dy: limit(dy, startBox.top, startBox.height, area.height),
  }
}
