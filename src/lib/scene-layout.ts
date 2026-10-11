import type { Layout } from "react-grid-layout/legacy"
import type {
  SceneWidget,
  WidgetProps,
} from "../../convex/lib/validators"

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
