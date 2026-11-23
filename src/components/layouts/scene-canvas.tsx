import { useMemo, type RefObject } from "react"
import { Repeat } from "lucide-react"
import GridLayout, {
  type Layout,
} from "react-grid-layout/legacy"
import { useContainerWidth } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import type { SceneWidget } from "../../../convex/lib/validators"
import {
  widgetsToLayout,
  type CatalogEntry,
} from "@/lib/scene-layout"
import { widgetIcon } from "./widget-icons"
import { TileSettings } from "./tile-settings"

const COLS = 12
const MAX_ROWS = 24
const MARGIN: readonly [number, number] = [10, 10]

export function SceneCanvas({
  widgets,
  catalog,
  draggedTypeRef,
  onLayoutChange,
  onDropWidget,
  onUpdateWidget,
  onRemoveWidget,
}: {
  widgets: SceneWidget[]
  catalog: readonly CatalogEntry[]
  draggedTypeRef: RefObject<string | null>
  onLayoutChange: (layout: Layout) => void
  onDropWidget: (
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void
  onUpdateWidget: (id: string, patch: Partial<SceneWidget>) => void
  onRemoveWidget: (id: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const layout = useMemo(
    () => widgetsToLayout(widgets, catalog),
    [widgets, catalog],
  )
  // 9:16 canvas: total height is rows * rowHeight + gaps + padding.
  const rowHeight = Math.max(
    16,
    ((width * 16) / 9 - (MAX_ROWS - 1) * MARGIN[1] - 2 * MARGIN[1]) /
      MAX_ROWS,
  )

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[600px]">
      {mounted && width > 0 && (
        <GridLayout
          className="layout"
          layout={layout}
          cols={COLS}
          rowHeight={rowHeight}
          width={width}
          maxRows={MAX_ROWS}
          margin={MARGIN}
          compactType={null}
          preventCollision
          isBounded
          isDroppable
          droppingItem={{ i: "__dropping", x: 0, y: 0, w: 4, h: 4 }}
          draggableCancel=".tile-gear"
          resizeHandles={["se"]}
          onLayoutChange={onLayoutChange}
          onDropDragOver={() => {
            const type = draggedTypeRef.current
            if (!type) {
              return false
            }
            const def = catalog.find((entry) => entry.type === type)
            return def ? { w: def.minW, h: def.minH } : false
          }}
          onDrop={(_layout, item) => {
            const type = draggedTypeRef.current
            draggedTypeRef.current = null
            if (!type || !item) {
              return
            }
            onDropWidget(type, item.x, item.y, item.w, item.h)
          }}
        >
          {widgets.map((widget) => {
            const Icon = widgetIcon(widget.type)
            const name =
              catalog.find((entry) => entry.type === widget.type)?.name ??
              widget.type
            const fallbackName =
              widget.fallback === undefined
                ? null
                : (catalog.find((entry) => entry.type === widget.fallback)
                    ?.name ?? widget.fallback)
            return (
              <div
                key={widget.id}
                className="relative rounded-xl border border-border bg-card p-3"
              >
                <div className="flex items-center gap-2 pr-6">
                  <Icon
                    className="size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium">{name}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  {widget.w} × {widget.h}
                  {fallbackName !== null && (
                    <span title={`Fallback: ${fallbackName}`}>
                      <Repeat
                        className="size-3.5"
                        aria-label={`Fallback: ${fallbackName}`}
                      />
                    </span>
                  )}
                </div>
                <TileSettings
                  widget={widget}
                  displayName={name}
                  catalog={catalog}
                  onUpdate={onUpdateWidget}
                  onRemove={onRemoveWidget}
                />
              </div>
            )
          })}
        </GridLayout>
      )}
    </div>
  )
}
