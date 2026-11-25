import { createElement, type PointerEvent, type ReactNode } from "react"
import { motion, useIsPresent, useReducedMotion, type Transition } from "motion/react"
import { cn } from "cn"
import { Repeat } from "lucide-react"
import type { Edge } from "@/lib/canvas-ops"
import type { CatalogEntry } from "@/lib/scene-layout"
import type { SceneWidget } from "../../../convex/lib/validators"
import type { GridBox } from "./canvas-pointer"
import {
  ENTER_SCALE,
  ENTER_SECONDS,
  EXIT_SECONDS,
  INSTANT,
  LIFT_SCALE,
  LIFT_SECONDS,
  TILE_SPRING,
} from "./canvas-motion"
import { widgetIcon } from "./widget-icons"
import { TileSettings } from "./tile-settings"

type Handle = {
  edges: readonly Edge[]
  cursor: string
  /** Position and size of the hit area, inside the tile. */
  area: string
  /** Visible bar, centred on the tile's border line so it never covers content. */
  bar: string
}

const HANDLES: readonly Handle[] = [
  { edges: ["n"], cursor: "cursor-ns-resize", area: "inset-x-4 top-0 h-2", bar: "inset-x-0 -top-[2.5px] h-1" },
  { edges: ["s"], cursor: "cursor-ns-resize", area: "inset-x-4 bottom-0 h-2", bar: "inset-x-0 -bottom-[2.5px] h-1" },
  { edges: ["w"], cursor: "cursor-ew-resize", area: "inset-y-4 left-0 w-2", bar: "inset-y-0 -left-[2.5px] w-1" },
  { edges: ["e"], cursor: "cursor-ew-resize", area: "inset-y-4 right-0 w-2", bar: "inset-y-0 -right-[2.5px] w-1" },
  { edges: ["n", "e"], cursor: "cursor-nesw-resize", area: "top-0 right-0 size-3.5", bar: "-top-[5.5px] -right-[5.5px] size-2.5" },
  { edges: ["s", "e"], cursor: "cursor-nwse-resize", area: "right-0 bottom-0 size-3.5", bar: "-right-[5.5px] -bottom-[5.5px] size-2.5" },
  { edges: ["s", "w"], cursor: "cursor-nesw-resize", area: "bottom-0 left-0 size-3.5", bar: "-bottom-[5.5px] -left-[5.5px] size-2.5" },
  { edges: ["n", "w"], cursor: "cursor-nwse-resize", area: "top-0 left-0 size-3.5", bar: "-top-[5.5px] -left-[5.5px] size-2.5" },
]

export function CanvasTile({
  widget,
  catalog,
  box,
  lifted,
  raised,
  onMoveStart,
  onResizeStart,
  onKeyDown,
  onUpdateWidget,
  onRemoveWidget,
}: {
  widget: SceneWidget
  catalog: readonly CatalogEntry[]
  /** Pixel rectangle inside the grid area; changes glide with the shared spring. */
  box: GridBox
  /** True while the tile is dragged by its body: follows the pointer, lifted. */
  lifted: boolean
  /** Stays above its neighbours while it glides into its slot after a drag. */
  raised: boolean
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

  const reduced = useReducedMotion() === true
  // An exiting tile (removed, fading out) is inert: no focus, no drag, no keys.
  const present = useIsPresent()
  const transition: Transition = reduced
    ? INSTANT
    : lifted
      ? { default: INSTANT, scale: { duration: LIFT_SECONDS, ease: "easeOut" } }
      : {
          default: TILE_SPRING,
          opacity: { duration: ENTER_SECONDS, ease: "easeOut" },
          scale: { duration: ENTER_SECONDS, ease: "easeOut" },
        }

  return (
    <motion.div
      tabIndex={present ? 0 : -1}
      aria-hidden={present ? undefined : true}
      role="group"
      aria-label={`${name}, Spalte ${widget.x + 1}, Zeile ${widget.y + 1}, ${widget.w} × ${widget.h}`}
      data-widget-id={widget.id}
      onPointerDown={(event) => {
        if (!present) {
          return
        }
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
      onKeyDown={(event) => {
        if (present) {
          onKeyDown(event, widget)
        }
      }}
      className={cn(
        "group touch-none rounded-xl border border-border bg-card p-3 select-none outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "absolute transition-shadow duration-200 motion-reduce:transition-none",
        !present && "pointer-events-none",
        raised && "z-30",
        lifted
          ? "cursor-grabbing shadow-[0_12px_28px_-8px_rgb(0_0_0/0.28)] dark:shadow-[0_12px_28px_-8px_rgb(0_0_0/0.75)]"
          : "cursor-grab",
      )}
      initial={reduced ? false : { ...box, opacity: 0, scale: ENTER_SCALE }}
      animate={{ ...box, opacity: 1, scale: lifted ? LIFT_SCALE : 1 }}
      exit={{
        opacity: 0,
        scale: ENTER_SCALE,
        transition: reduced ? INSTANT : { duration: EXIT_SECONDS, ease: "easeOut" },
      }}
      transition={transition}
    >
      {!lifted && HANDLES.map((handle) => (
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
    </motion.div>
  )
}
