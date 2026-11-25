import type { Layout } from "react-grid-layout/legacy"
import type {
  ScenePalette,
  SceneWidget,
  WidgetProps,
} from "../../convex/lib/validators"

/**
 * Palette shown in the builder header: the form is the source of truth
 * whenever it exists (an unset palette there means "Automatisch"); the
 * published stand only stands in while there is no form.
 */
export function headerPalette(
  form: { palette?: ScenePalette } | null,
  published: { palette?: ScenePalette } | null | undefined,
): ScenePalette | undefined {
  return form !== null ? form.palette : published?.palette
}

export type CatalogEntry = {
  type: string
  name: string
  minW: number
  minH: number
}

/** Widget list → grid items (ids stable, minima from the catalog). */
export function widgetsToLayout(
  widgets: SceneWidget[],
  catalog: readonly CatalogEntry[],
): Layout {
  const minima = new Map(catalog.map((entry) => [entry.type, entry]))
  return widgets.map((widget) => {
    const def = minima.get(widget.type)
    return {
      i: widget.id,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: def?.minW ?? 1,
      minH: def?.minH ?? 1,
    }
  })
}

/**
 * Grid changes back into widgets: positions/sizes sync by id, unknown ids
 * (the drop placeholder) are ignored, missing widgets are kept (a drop
 * appends separately, deletes never come through the layout).
 */
export function applyLayoutChange(
  widgets: SceneWidget[],
  layout: Layout,
): SceneWidget[] {
  const byId = new Map(layout.map((item) => [item.i, item]))
  return widgets.map((widget) => {
    const item = byId.get(widget.id)
    if (!item) {
      return widget
    }
    return { ...widget, x: item.x, y: item.y, w: item.w, h: item.h }
  })
}

/** True when two widget lists place the same tiles (order-independent). */
export function samePlacements(a: SceneWidget[], b: SceneWidget[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const byId = new Map(b.map((widget) => [widget.id, widget]))
  return a.every((widget) => {
    const other = byId.get(widget.id)
    return (
      other !== undefined &&
      other.x === widget.x &&
      other.y === widget.y &&
      other.w === widget.w &&
      other.h === widget.h
    )
  })
}

const GRID_COLS = 12
const GRID_ROWS = 24

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * First free top-left rectangle of the given size, row by row, or null when
 * nothing fits (keyboard/click placement without drag and drop).
 */
export function firstFreeSpot(
  widgets: Pick<SceneWidget, "x" | "y" | "w" | "h">[],
  w: number,
  h: number,
): { x: number; y: number } | null {
  for (let y = 0; y + h <= GRID_ROWS; y++) {
    for (let x = 0; x + w <= GRID_COLS; x++) {
      const candidate = { x, y, w, h }
      if (!widgets.some((widget) => overlaps(widget, candidate))) {
        return { x, y }
      }
    }
  }
  return null
}

/** Default props for a freshly dropped widget (required settings prefilled). */
export function defaultPropsFor(type: string): WidgetProps {
  if (type === "briefing") {
    return { kind: "today" }
  }
  if (type === "school") {
    return { mode: "plan-meal", mealDay: "today" }
  }
  return {}
}
