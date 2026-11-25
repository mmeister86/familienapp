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

export type Edge = "n" | "e" | "s" | "w"

/** Move a tile to a new top-left cell (clamped into the grid); null when blocked. */
export function moveTile(
  widgets: readonly SceneWidget[],
  id: string,
  to: Cell,
): SceneWidget[] | null {
  const tile = widgets.find((t) => t.id === id)
  if (!tile) {
    return null
  }
  const x = Math.max(0, Math.min(to.col, GRID.cols - tile.w))
  const y = Math.max(0, Math.min(to.row, GRID.rows - tile.h))
  if (x === tile.x && y === tile.y) {
    return [...widgets]
  }
  const target = { x, y, w: tile.w, h: tile.h }
  if (widgets.some((t) => t.id !== id && overlaps(t, target))) {
    return null
  }
  return widgets.map((t) => (t.id === id ? { ...t, x, y } : t))
}

export type MovePlan =
  | { kind: "move"; widgets: SceneWidget[] }
  | {
      kind: "split"
      widgets: SceneWidget[]
      targetId: string
      side: Side
      added: Rect
    }
  | { kind: "blocked"; rect: Rect }

/**
 * Where a dragged tile ends up. Over another tile (looked up without the
 * dragged one) that tile is split like for a sidebar drop and the dragged tile
 * takes the added part; elsewhere it moves to `to` as moveTile does. The old
 * place just becomes free. `blocked.rect` is what to outline in red.
 */
export function planMove(
  widgets: readonly SceneWidget[],
  id: string,
  to: Cell,
  point: { x: number; y: number },
  minima: Minima,
): MovePlan {
  const cell: Cell = {
    col: Math.min(GRID.cols - 1, Math.floor(point.x)),
    row: Math.min(GRID.rows - 1, Math.floor(point.y)),
  }
  const pointerCell: Rect = { x: cell.col, y: cell.row, w: 1, h: 1 }
  const tile = widgets.find((t) => t.id === id)
  if (!tile) {
    return { kind: "blocked", rect: pointerCell }
  }
  const rest = widgets.filter((t) => t.id !== id)
  if (tileAt(rest, cell)) {
    const plan = planDrop(rest, tile.type, point, minima)
    if (plan.kind !== "split") {
      return { kind: "blocked", rect: pointerCell }
    }
    return {
      kind: "split",
      targetId: plan.targetId,
      side: plan.side,
      added: plan.added,
      widgets: widgets.map((t) => {
        if (t.id === id) {
          return { ...t, ...plan.added }
        }
        return t.id === plan.targetId ? { ...t, ...plan.target } : t
      }),
    }
  }
  const moved = moveTile(widgets, id, to)
  if (moved !== null) {
    return { kind: "move", widgets: moved }
  }
  return {
    kind: "blocked",
    rect: {
      x: Math.max(0, Math.min(to.col, GRID.cols - tile.w)),
      y: Math.max(0, Math.min(to.row, GRID.rows - tile.h)),
      w: tile.w,
      h: tile.h,
    },
  }
}

type Axis = "x" | "y"

const EDGE: Record<Edge, { axis: Axis; outward: 1 | -1; horizontal: boolean }> = {
  e: { axis: "x", outward: 1, horizontal: true },
  w: { axis: "x", outward: -1, horizontal: true },
  s: { axis: "y", outward: 1, horizontal: false },
  n: { axis: "y", outward: -1, horizontal: false },
}

const ORDER: readonly Edge[] = ["e", "w", "s", "n"]

const lenKey = { x: "w", y: "h" } as const
const crossOf = { x: "y", y: "x" } as const

function extent(r: Rect, axis: Axis): [number, number] {
  return [r[axis], r[axis] + r[lenKey[axis]]]
}

/** Largest k <= wanted by which the tile can grow over this edge; 0 when none. */
function feasibleGrowth(
  widgets: readonly SceneWidget[],
  tile: SceneWidget,
  edge: Edge,
  wanted: number,
  minima: Minima,
): number {
  const { axis, outward } = EDGE[edge]
  const cross = crossOf[axis]
  const limit = axis === "x" ? GRID.cols : GRID.rows
  const [start, end] = extent(tile, axis)
  const [crossStart, crossEnd] = extent(tile, cross)
  for (let k = wanted; k > 0; k--) {
    const line = outward > 0 ? end + k : start - k
    if (line < 0 || line > limit) {
      continue
    }
    const bandStart = outward > 0 ? end : line
    const bandEnd = outward > 0 ? line : start
    let ok = true
    for (const other of widgets) {
      if (other.id === tile.id) {
        continue
      }
      const [o0, o1] = extent(other, axis)
      const [c0, c1] = extent(other, cross)
      if (o0 >= bandEnd || o1 <= bandStart || c0 >= crossEnd || c1 <= crossStart) {
        continue
      }
      const min = minima(other.type)
      const minLen = axis === "x" ? min.minW : min.minH
      const newLen = outward > 0 ? o1 - line : line - o0
      if (newLen < minLen) {
        ok = false
        break
      }
    }
    if (ok) {
      return k
    }
  }
  return 0
}

function growEdge(
  widgets: readonly SceneWidget[],
  id: string,
  edge: Edge,
  k: number,
): SceneWidget[] {
  const { axis, outward } = EDGE[edge]
  const len = lenKey[axis]
  const cross = crossOf[axis]
  const tile = widgets.find((t) => t.id === id)
  if (!tile) {
    return [...widgets]
  }
  const [start, end] = extent(tile, axis)
  const [crossStart, crossEnd] = extent(tile, cross)
  const line = outward > 0 ? end + k : start - k
  const bandStart = outward > 0 ? end : line
  const bandEnd = outward > 0 ? line : start
  return widgets.map((t) => {
    if (t.id === id) {
      return outward > 0
        ? { ...t, [len]: t[len] + k }
        : { ...t, [axis]: line, [len]: t[len] + k }
    }
    const [o0, o1] = extent(t, axis)
    const [c0, c1] = extent(t, cross)
    if (o0 >= bandEnd || o1 <= bandStart || c0 >= crossEnd || c1 <= crossStart) {
      return t
    }
    return outward > 0
      ? { ...t, [axis]: line, [len]: o1 - line }
      : { ...t, [len]: line - o0 }
  })
}

function shrinkEdge(
  widgets: readonly SceneWidget[],
  id: string,
  edge: Edge,
  k: number,
  followers: ReadonlySet<string>,
): SceneWidget[] {
  const { axis, outward } = EDGE[edge]
  const len = lenKey[axis]
  return widgets.map((t) => {
    if (t.id === id) {
      return outward > 0
        ? { ...t, [len]: t[len] - k }
        : { ...t, [axis]: t[axis] + k, [len]: t[len] - k }
    }
    if (!followers.has(t.id)) {
      return t
    }
    return outward > 0
      ? { ...t, [axis]: t[axis] - k, [len]: t[len] + k }
      : { ...t, [len]: t[len] + k }
  })
}

/** Tiles flush against the edge whose extent along it lies within the tile's. */
function followersOf(
  widgets: readonly SceneWidget[],
  tile: SceneWidget,
  edge: Edge,
): Set<string> {
  const { axis, outward } = EDGE[edge]
  const cross = crossOf[axis]
  const [start, end] = extent(tile, axis)
  const [crossStart, crossEnd] = extent(tile, cross)
  const line = outward > 0 ? end : start
  const ids = new Set<string>()
  for (const other of widgets) {
    if (other.id === tile.id) {
      continue
    }
    const [o0, o1] = extent(other, axis)
    const [c0, c1] = extent(other, cross)
    const flush = outward > 0 ? o0 === line : o1 === line
    if (flush && c0 >= crossStart && c1 <= crossEnd) {
      ids.add(other.id)
    }
  }
  return ids
}

/**
 * Move edges of a tile by the pointer delta (cells, right/down positive),
 * computed from the layout at drag start. Edges are applied in the order e, w, s, n, each
 * deciding pushes and followers from the layout the previous edge left.
 * Never returns an invalid layout (falls back to the input). Growing shrinks the tiles in the
 * way down to their minimum; shrinking lets flush neighbours follow.
 */
export function resizeTile(
  widgets: readonly SceneWidget[],
  id: string,
  edges: readonly Edge[],
  delta: { dx: number; dy: number },
  minima: Minima,
): SceneWidget[] {
  if (!widgets.some((t) => t.id === id)) {
    return [...widgets]
  }
  let current: SceneWidget[] = [...widgets]
  // fixed order, independent of how the caller lists them: horizontal first
  for (const edge of ORDER.filter((e) => edges.includes(e))) {
    const { axis, outward, horizontal } = EDGE[edge]
    const growth = Math.trunc(horizontal ? delta.dx : delta.dy) * outward
    const tile = current.find((t) => t.id === id)
    if (!tile) {
      return [...widgets]
    }
    if (growth > 0) {
      const k = feasibleGrowth(current, tile, edge, growth, minima)
      if (k > 0) {
        current = growEdge(current, id, edge, k)
      }
    } else if (growth < 0) {
      const min = minima(tile.type)
      const minLen = horizontal ? min.minW : min.minH
      const k = Math.min(-growth, tile[lenKey[axis]] - minLen)
      if (k > 0) {
        current = shrinkEdge(current, id, edge, k, followersOf(current, tile, edge))
      }
    }
  }
  return isValidLayout(current, minima) ? current : [...widgets]
}

/** Remove a tile and let the tiles of one fully flush side grow into the gap. */
export function removeTile(
  widgets: readonly SceneWidget[],
  id: string,
): SceneWidget[] {
  const gone = widgets.find((t) => t.id === id)
  if (!gone) {
    return [...widgets]
  }
  const rest = widgets.filter((t) => t.id !== id)
  const sides: { side: Side; axis: Axis; outward: 1 | -1 }[] = [
    { side: "left", axis: "x", outward: -1 },
    { side: "top", axis: "y", outward: -1 },
    { side: "right", axis: "x", outward: 1 },
    { side: "bottom", axis: "y", outward: 1 },
  ]
  let best: { ids: Set<string>; axis: Axis; outward: 1 | -1 } | null = null
  for (const { axis, outward } of sides) {
    const cross = crossOf[axis]
    const [start, end] = extent(gone, axis)
    const [crossStart, crossEnd] = extent(gone, cross)
    const line = outward > 0 ? end : start
    const ids = new Set<string>()
    let covered = 0
    let qualifies = true
    for (const t of rest) {
      const [o0, o1] = extent(t, axis)
      const [c0, c1] = extent(t, cross)
      const flush = outward > 0 ? o0 === line : o1 === line
      if (!flush || c0 >= crossEnd || c1 <= crossStart) {
        continue
      }
      if (c0 < crossStart || c1 > crossEnd) {
        qualifies = false
        break
      }
      ids.add(t.id)
      covered += c1 - c0
    }
    if (
      qualifies &&
      ids.size > 0 &&
      covered === crossEnd - crossStart &&
      (best === null || ids.size < best.ids.size)
    ) {
      best = { ids, axis, outward }
    }
  }
  if (!best) {
    return rest
  }
  const { ids, axis, outward } = best
  const len = lenKey[axis]
  return rest.map((t) => {
    if (!ids.has(t.id)) {
      return t
    }
    return outward > 0
      ? { ...t, [axis]: gone[axis], [len]: t[len] + gone[len] }
      : { ...t, [len]: t[len] + gone[len] }
  })
}
