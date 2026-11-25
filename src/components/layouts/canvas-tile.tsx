import { createElement, type PointerEvent, type ReactNode } from "react"
import { cn } from "cn"
import { Repeat } from "lucide-react"
import type { Edge } from "@/lib/canvas-ops"
import type { CatalogEntry } from "@/lib/scene-layout"
import type { SceneWidget } from "../../../convex/lib/validators"
import { widgetIcon } from "./widget-icons"
import { TileSettings } from "./tile-settings"

type Handle = {
  edges: readonly Edge[]
  cursor: string
  /** Position and size of the hit area, inside the tile. */
  area: string
  /** Look of the visible bar. */
  bar: string
}

const HANDLES: readonly Handle[] = [
  { edges: ["n"], cursor: "cursor-ns-resize", area: "inset-x-4 top-0 h-2", bar: "inset-x-0 top-0.5 h-1" },
  { edges: ["s"], cursor: "cursor-ns-resize", area: "inset-x-4 bottom-0 h-2", bar: "inset-x-0 bottom-0.5 h-1" },
  { edges: ["w"], cursor: "cursor-ew-resize", area: "inset-y-4 left-0 w-2", bar: "inset-y-0 left-0.5 w-1" },
  { edges: ["e"], cursor: "cursor-ew-resize", area: "inset-y-4 right-0 w-2", bar: "inset-y-0 right-0.5 w-1" },
  { edges: ["n", "e"], cursor: "cursor-nesw-resize", area: "top-0 right-0 size-3.5", bar: "top-0.5 right-0.5 size-2.5" },
  { edges: ["s", "e"], cursor: "cursor-nwse-resize", area: "right-0 bottom-0 size-3.5", bar: "right-0.5 bottom-0.5 size-2.5" },
  { edges: ["s", "w"], cursor: "cursor-nesw-resize", area: "bottom-0 left-0 size-3.5", bar: "bottom-0.5 left-0.5 size-2.5" },
  { edges: ["n", "w"], cursor: "cursor-nwse-resize", area: "top-0 left-0 size-3.5", bar: "top-0.5 left-0.5 size-2.5" },
]

export function CanvasTile({
  widget,
  catalog,
  active,
  onMoveStart,
  onResizeStart,
  onKeyDown,
  onUpdateWidget,
  onRemoveWidget,
}: {
  widget: SceneWidget
  catalog: readonly CatalogEntry[]
  /** True while this tile is being dragged. */
  active: boolean
  onMoveStart: (event: PointerEvent<HTMLElement>, widget: SceneWidget) => void
  onResizeStart: (
    event: PointerEvent<HTMLElement>,
    widget: SceneWidget,
    edges: readonly Edge[],
  ) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, widget: SceneWidget) => void
  onUpdateWidget: (id: string, patch: Partial<SceneWidget>) => void
  onRemoveWidget: (id: string) => void
}): ReactNode {
  const name =
    catalog.find((entry) => entry.type === widget.type)?.name ?? widget.type
  const fallbackName =
    widget.fallback === undefined
      ? null
      : (catalog.find((entry) => entry.type === widget.fallback)?.name ??
        widget.fallback)

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${name}, Spalte ${widget.x + 1}, Zeile ${widget.y + 1}, ${widget.w} × ${widget.h}`}
      data-widget-id={widget.id}
      onPointerDown={(event) => {
        // Portaled popover content bubbles through React; only the tile's own DOM moves it.
        if (
          event.button !== 0 ||
          !event.currentTarget.contains(event.target as Node) ||
          (event.target as Element).closest(".tile-gear")
        ) {
          return
        }
        onMoveStart(event, widget)
      }}
      onKeyDown={(event) => onKeyDown(event, widget)}
      className={cn(
        "group relative touch-none rounded-xl border border-border bg-card p-3 select-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "z-10 cursor-grabbing shadow-lg" : "cursor-grab",
      )}
      style={{
        gridColumn: `${widget.x + 1} / span ${widget.w}`,
        gridRow: `${widget.y + 1} / span ${widget.h}`,
      }}
    >
      {HANDLES.map((handle) => (
        <div
          key={handle.edges.join("")}
          data-handle={handle.edges.join("")}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return
            }
            event.stopPropagation()
            onResizeStart(event, widget, handle.edges)
          }}
          className={cn("absolute", handle.area, handle.cursor)}
        >
          <span
            className={cn(
              "absolute rounded-full bg-primary/40 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
              handle.bar,
            )}
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pr-6">
        {createElement(widgetIcon(widget.type), {
          className: "size-4 shrink-0 text-primary",
          "aria-hidden": true,
        })}
        <span className="truncate text-sm font-medium">{name}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
        {widget.w} × {widget.h}
        {fallbackName !== null && (
          <span title={`Fallback: ${fallbackName}`}>
            <Repeat className="size-3.5" aria-label={`Fallback: ${fallbackName}`} />
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
}
