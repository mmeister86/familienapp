import type { SceneWidget } from "../../convex/lib/validators"
import { firstFreeSpot, type CatalogEntry } from "./scene-layout"

export const GRID = { cols: 12, rows: 24 } as const

export type Rect = { x: number; y: number; w: number; h: number }
export type Cell = { col: number; row: number }
export type Side = "left" | "right" | "top" | "bottom"
export type Minimum = { minW: number; minH: number }
export type Minima = (type: string) => Minimum

export type DropPlan =
  | { kind: "place"; added: Rect }
  | {
      kind: "split"
      targetId: string
      side: Side
      target: Rect
      added: Rect
    }
  | { kind: "blocked" }

const SIDES: readonly Side[] = ["left", "right", "top", "bottom"]

/** Minimum lookup from the catalog; unknown types are 1x1. */
export function minimaFrom(catalog: readonly CatalogEntry[]): Minima {
  const byType = new Map(catalog.map((entry) => [entry.type, entry]))
  return (type) => {
    const entry = byType.get(type)
    return { minW: entry?.minW ?? 1, minH: entry?.minH ?? 1 }
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

function insideGrid(r: Rect): boolean {
  return (
    Number.isInteger(r.x) &&
    Number.isInteger(r.y) &&
    Number.isInteger(r.w) &&
    Number.isInteger(r.h) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.w >= 1 &&
    r.h >= 1 &&
    r.x + r.w <= GRID.cols &&
    r.y + r.h <= GRID.rows
  )
}

/** No overlaps, every tile inside the grid and at least its catalog minimum. */
export function isValidLayout(
  widgets: readonly SceneWidget[],
  minima: Minima,
): boolean {
  for (let i = 0; i < widgets.length; i++) {
    const a = widgets[i]
    const min = minima(a.type)
    if (!insideGrid(a) || a.w < min.minW || a.h < min.minH) {
      return false
    }
    for (let j = i + 1; j < widgets.length; j++) {
      if (overlaps(a, widgets[j])) {
        return false
      }
    }
  }
  return true
}

/** The tile covering the cell, if any. */
export function tileAt(
  widgets: readonly SceneWidget[],
  cell: Cell,
): SceneWidget | undefined {
  return widgets.find(
    (t) =>
      cell.col >= t.x &&
      cell.col < t.x + t.w &&
      cell.row >= t.y &&
      cell.row < t.y + t.h,
  )
}

/**
 * Free rectangle of the minimum size that contains the cell, as close to the
 * cell-anchored position as possible; null when none is free.
 */
export function placeFree(
  widgets: readonly SceneWidget[],
  size: Minimum,
  cell: Cell,
): Rect | null {
  const { minW: w, minH: h } = size
  if (w > GRID.cols || h > GRID.rows) {
    return null
  }
  const anchorX = Math.min(cell.col, GRID.cols - w)
  const anchorY = Math.min(cell.row, GRID.rows - h)
  let best: { rect: Rect; dist: number; tie: number } | null = null
  const xLo = Math.max(0, cell.col - w + 1)
  const xHi = Math.min(cell.col, GRID.cols - w)
  const yLo = Math.max(0, cell.row - h + 1)
  const yHi = Math.min(cell.row, GRID.rows - h)
  for (let y = yLo; y <= yHi; y++) {
    for (let x = xLo; x <= xHi; x++) {
      const rect = { x, y, w, h }
      if (widgets.some((t) => overlaps(t, rect))) {
        continue
      }
      const dx = Math.abs(x - anchorX)
      const dy = Math.abs(y - anchorY)
      const dist = dx + dy
      // ties: horizontal before vertical, then left/up before right/down
      const tie = (dx > 0 ? 0 : 2) + (dx > 0 ? (x < anchorX ? 0 : 1) : y < anchorY ? 0 : 1)
      if (
        best === null ||
        dist < best.dist ||
        (dist === best.dist && tie < best.tie)
      ) {
        best = { rect, dist, tie }
      }
    }
  }
  return best?.rect ?? null
}

/** Split the target along a side; null when either part would be too small. */
export function splitTile(
  target: SceneWidget,
  side: Side,
  added: Minimum,
  targetMin: Minimum,
): { target: Rect; added: Rect } | null {
  const horizontal = side === "left" || side === "right"
  const total = horizontal ? target.w : target.h
  const addedMin = horizontal ? added.minW : added.minH
  const keepMin = horizontal ? targetMin.minW : targetMin.minH
  const crossMin = horizontal ? added.minH : added.minW
  const cross = horizontal ? target.h : target.w
  const addedSize = Math.max(Math.floor(total / 2), addedMin)
  const keep = total - addedSize
  if (keep < keepMin || cross < crossMin) {
    return null
  }
  const { x, y, w, h } = target
  switch (side) {
    case "right":
      return {
        target: { x, y, w: keep, h },
        added: { x: x + keep, y, w: addedSize, h },
      }
    case "left":
      return {
        target: { x: x + addedSize, y, w: keep, h },
        added: { x, y, w: addedSize, h },
      }
    case "bottom":
      return {
        target: { x, y, w, h: keep },
        added: { x, y: y + keep, w, h: addedSize },
      }
    case "top":
      return {
        target: { x, y: y + addedSize, w, h: keep },
        added: { x, y, w, h: addedSize },
      }
  }
}

/** Where a dropped widget goes: free space, a split of the tile, or nowhere. */
export function planDrop(
  widgets: readonly SceneWidget[],
  type: string,
  point: { x: number; y: number },
  minima: Minima,
): DropPlan {
  const cell: Cell = {
    col: Math.min(GRID.cols - 1, Math.floor(point.x)),
    row: Math.min(GRID.rows - 1, Math.floor(point.y)),
  }
  const added = minima(type)
  const tile = tileAt(widgets, cell)
  if (!tile) {
    const rect = placeFree(widgets, added, cell)
    return rect ? { kind: "place", added: rect } : { kind: "blocked" }
  }
  const distance: Record<Side, number> = {
    left: Math.abs(point.x - tile.x),
    right: Math.abs(point.x - (tile.x + tile.w)),
    top: Math.abs(point.y - tile.y),
    bottom: Math.abs(point.y - (tile.y + tile.h)),
  }
  const ordered = [...SIDES].sort((a, b) => distance[a] - distance[b])
  const targetMin = minima(tile.type)
  for (const side of ordered) {
    const split = splitTile(tile, side, added, targetMin)
    if (split) {
      return { kind: "split", targetId: tile.id, side, ...split }
    }
  }
  return { kind: "blocked" }
}

function area(r: Rect): number {
  return r.w * r.h
}

/** Click-to-add: first free spot, else split the largest splittable tile. */
export function planClickAdd(
  widgets: readonly SceneWidget[],
  type: string,
  minima: Minima,
): DropPlan {
  const size = minima(type)
  const spot = firstFreeSpot([...widgets], size.minW, size.minH)
  if (spot) {
    return {
      kind: "place",
      added: { x: spot.x, y: spot.y, w: size.minW, h: size.minH },
    }
  }
  let best: { plan: DropPlan; tileArea: number; smaller: number } | null = null
  for (const tile of widgets) {
    const targetMin = minima(tile.type)
    for (const side of ["bottom", "right"] as const) {
      const split = splitTile(tile, side, size, targetMin)
      if (!split) {
        continue
      }
      const smaller = Math.min(area(split.target), area(split.added))
      const tileArea = area(tile)
      if (
        best === null ||
        tileArea > best.tileArea ||
        (tileArea === best.tileArea &&
          best.plan.kind === "split" &&
          best.plan.targetId === tile.id &&
          smaller > best.smaller)
      ) {
        best = {
          plan: { kind: "split", targetId: tile.id, side, ...split },
          tileArea,
          smaller,
        }
      }
    }
  }
  return best?.plan ?? { kind: "blocked" }
}

/** Apply a plan; null for a blocked plan or an unknown split target. */
export function applyDrop(
  widgets: readonly SceneWidget[],
  plan: DropPlan,
  widget: Pick<SceneWidget, "id" | "type" | "props">,
): SceneWidget[] | null {
  if (plan.kind === "blocked") {
    return null
  }
  const fresh = {
    id: widget.id,
    type: widget.type,
    ...(widget.props === undefined ? {} : { props: widget.props }),
    ...plan.added,
  } as SceneWidget
  if (plan.kind === "place") {
    return [...widgets, fresh]
  }
  if (!widgets.some((t) => t.id === plan.targetId)) {
    return null
  }
  return [
    ...widgets.map((t) => (t.id === plan.targetId ? { ...t, ...plan.target } : t)),
    fresh,
  ]
}
