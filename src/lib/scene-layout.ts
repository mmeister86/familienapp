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

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null ||
    Array.isArray(a) !== Array.isArray(b)
  ) {
    return false
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => deepEqual(left[key], right[key]))
}

/**
 * True when two widget lists are the same scene content (order-independent):
 * same ids with equal type, geometry, fallback and deeply equal props.
 */
export function sameWidgets(a: SceneWidget[], b: SceneWidget[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const byId = new Map(b.map((widget) => [widget.id, widget]))
  return a.every((widget) => {
    const other = byId.get(widget.id)
    return (
      other !== undefined &&
      other.type === widget.type &&
      other.x === widget.x &&
      other.y === widget.y &&
      other.w === widget.w &&
      other.h === widget.h &&
      other.fallback === widget.fallback &&
      deepEqual(other.props, widget.props)
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
