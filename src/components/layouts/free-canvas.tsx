import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react"
import {
  GRID,
  applyDrop,
  minimaFrom,
  moveTile,
  planDrop,
  planMove,
  resizeTile,
  tileAt,
  type DropPlan,
  type Edge,
  type Rect,
} from "@/lib/canvas-ops"
import type { CatalogEntry } from "@/lib/scene-layout"
import type { SceneWidget } from "../../../convex/lib/validators"
import { deltaCells, pointToGrid } from "./canvas-pointer"
import { PreviewOutline } from "./canvas-preview"
import { CanvasTile } from "./canvas-tile"

const GAP_PX = 6
const PREVIEW_ID = "__preview"

type Drag = {
  id: string
  /** null moves the tile, otherwise the edges being resized. */
  edges: readonly Edge[] | null
  start: SceneWidget[]
  px: number
  py: number
}

type Live = {
  id: string
  widgets: SceneWidget[]
  /** Red outline: where the tile does not fit; labelled when a split was refused. */
  blocked: { rect: Rect; label?: string } | null
  /** Green outline: the part a moved tile takes when it splits another tile. */
  split: { rect: Rect; type: string } | null
}

type DropHover = { type: string; plan: DropPlan; point: { x: number; y: number } }

function sameLayout(a: readonly SceneWidget[], b: readonly SceneWidget[]): boolean {
  return (
    a.length === b.length &&
    a.every((tile) => {
      const other = b.find((t) => t.id === tile.id)
      return (
        other !== undefined &&
        other.x === tile.x &&
        other.y === tile.y &&
        other.w === tile.w &&
        other.h === tile.h
      )
    })
  )
}

const ARROWS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}

export function FreeCanvas({
  widgets,
  catalog,
  draggedTypeRef,
  onChange,
  onAddWidget,
  onUpdateWidget,
  onRemoveWidget,
  forcedDrop,
}: {
  widgets: SceneWidget[]
  catalog: readonly CatalogEntry[]
  draggedTypeRef: RefObject<string | null>
  /** Called once per completed move or resize (on release or key press). */
  onChange: (widgets: SceneWidget[]) => void
  onAddWidget: (type: string, plan: DropPlan) => void
  onUpdateWidget: (id: string, patch: Partial<SceneWidget>) => void
  onRemoveWidget: (id: string) => void
  /** For the dev playground's demo states only; never set by the app. Behaves as if a sidebar drag hovered this point. */
  forcedDrop?: { type: string; point: { x: number; y: number } }
}) {
  const minima = useMemo(() => minimaFrom(catalog), [catalog])
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [hover, setHover] = useState<DropHover | null>(null)
  const dragging = live !== null

  useEffect(() => {
    if (!dragging) {
      return
    }
    const cancel = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        dragRef.current = null
        setLive(null)
      }
    }
    window.addEventListener("keydown", cancel)
    return () => window.removeEventListener("keydown", cancel)
  }, [dragging])

  const nameOf = (type: string): string =>
    catalog.find((entry) => entry.type === type)?.name ?? type

  const planFor = (type: string, point: { x: number; y: number }): DropPlan =>
    planDrop(widgets, type, point, minima)

  const forced: DropHover | null = forcedDrop
    ? {
        type: forcedDrop.type,
        point: forcedDrop.point,
        plan: planFor(forcedDrop.type, forcedDrop.point),
      }
    : null
  const drop = forced ?? hover

  // --- sidebar drag (HTML5 drag and drop) ---------------------------------

  const pointerGrid = (event: { clientX: number; clientY: number }) => {
    const box = gridRef.current?.getBoundingClientRect()
    return box ? pointToGrid(event.clientX, event.clientY, box) : null
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    const type = draggedTypeRef.current
    const point = pointerGrid(event)
    if (!type || !point) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    const plan = planFor(type, point)
    setHover((prev) =>
      prev !== null &&
      prev.type === type &&
      JSON.stringify(prev.plan) === JSON.stringify(plan) &&
      Math.floor(prev.point.x) === Math.floor(point.x) &&
      Math.floor(prev.point.y) === Math.floor(point.y)
        ? prev
        : { type, plan, point },
    )
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setHover(null)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    const type = draggedTypeRef.current
    const point = pointerGrid(event)
    setHover(null)
    if (!type || !point) {
      return
    }
    event.preventDefault()
    draggedTypeRef.current = null
    const plan = planFor(type, point)
    if (plan.kind !== "blocked") {
      onAddWidget(type, plan)
    }
  }

  // --- pointer drags: move and resize -------------------------------------

  const compute = (drag: Drag, event: PointerEvent): Live => {
    const box = gridRef.current?.getBoundingClientRect()
    const tile = drag.start.find((t) => t.id === drag.id)
    if (!box || !tile) {
      return { id: drag.id, widgets: drag.start, blocked: null, split: null }
    }
    const dx = deltaCells(drag.px, event.clientX, box.width / GRID.cols)
    const dy = deltaCells(drag.py, event.clientY, box.height / GRID.rows)
    if (drag.edges !== null) {
      return {
        id: drag.id,
        widgets: resizeTile(drag.start, drag.id, drag.edges, { dx, dy }, minima),
        blocked: null,
        split: null,
      }
    }
    const point = pointToGrid(event.clientX, event.clientY, box)
    const plan = planMove(
      drag.start,
      drag.id,
      { col: tile.x + dx, row: tile.y + dy },
      point,
      minima,
    )
    if (plan.kind === "blocked") {
      const refusedSplit =
        tileAt(
          drag.start.filter((t) => t.id !== drag.id),
          { col: Math.floor(point.x), row: Math.floor(point.y) },
        ) !== undefined
      return {
        id: drag.id,
        widgets: drag.start,
        blocked: refusedSplit ? { rect: plan.rect, label: "Kein Platz" } : { rect: plan.rect },
        split: null,
      }
    }
    return {
      id: drag.id,
      widgets: plan.widgets,
      blocked: null,
      split: plan.kind === "split" ? { rect: plan.added, type: tile.type } : null,
    }
  }

  const begin = (
    event: PointerEvent<HTMLElement>,
    widget: SceneWidget,
    edges: readonly Edge[] | null,
  ): void => {
    if (!event.isPrimary || event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: widget.id,
      edges,
      start: widgets,
      px: event.clientX,
      py: event.clientY,
    }
    setLive({ id: widget.id, widgets, blocked: null, split: null })
  }

  const onPointerCancel = (): void => {
    dragRef.current = null
    setLive(null)
  }

  const onPointerMove = (event: PointerEvent): void => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    if (event.buttons === 0) {
      // The release happened elsewhere (lost pointerup): cancel, apply nothing.
      onPointerCancel()
      return
    }
    setLive(compute(drag, event))
  }

  const onPointerUp = (event: PointerEvent): void => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    dragRef.current = null
    const result = compute(drag, event)
    setLive(null)
    if (result.blocked === null && !sameLayout(result.widgets, drag.start)) {
      onChange(result.widgets)
    }
  }

  // Removal from the tile's settings popover: the focused control vanishes
  // with the tile, so hand focus back to the canvas like the Delete key does.
  const removeFromPopover = (id: string): void => {
    onRemoveWidget(id)
    gridRef.current?.focus()
  }

  // --- keyboard -----------------------------------------------------------

  const onTileKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    widget: SceneWidget,
  ): void => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      onRemoveWidget(widget.id)
      // The focused tile is about to vanish; keep keyboard users in the canvas.
      gridRef.current?.focus()
      return
    }
    const arrow = ARROWS[event.key]
    if (!arrow) {
      return
    }
    event.preventDefault()
    const next = event.shiftKey
      ? resizeTile(
          widgets,
          widget.id,
          [arrow.dx !== 0 ? "e" : "s"],
          arrow,
          minima,
        )
      : moveTile(widgets, widget.id, { col: widget.x + arrow.dx, row: widget.y + arrow.dy })
    if (next !== null && !sameLayout(next, widgets)) {
      onChange(next)
    }
  }

  // --- what to draw -------------------------------------------------------

  const splitPlan = drop !== null && drop.plan.kind === "split" ? drop.plan : null
  const splitLayout =
    drop !== null && splitPlan !== null
      ? applyDrop(widgets, splitPlan, { id: PREVIEW_ID, type: drop.type, props: undefined })
      : null
  const shown: SceneWidget[] =
    live?.widgets ?? splitLayout?.filter((t) => t.id !== PREVIEW_ID) ?? widgets

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `repeat(${GRID.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${GRID.rows}, minmax(0, 1fr))`,
    gap: GAP_PX,
  } as const

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-background">
        <div
          ref={gridRef}
          tabIndex={-1}
          className="absolute inset-x-0 top-0 h-[97.5%] outline-none"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="absolute inset-0" style={gridStyle} aria-hidden="true">
            {Array.from({ length: GRID.cols * GRID.rows }, (_, i) => (
              <div key={i} className="rounded-sm border border-dashed border-muted-foreground/25" />
            ))}
          </div>
          <div className="absolute inset-0" style={gridStyle}>
            {shown.map((widget) => (
              <CanvasTile
                key={widget.id}
                widget={widget}
                catalog={catalog}
                active={live?.id === widget.id}
                onMoveStart={(event, w) => begin(event, w, null)}
                onResizeStart={begin}
                onKeyDown={onTileKeyDown}
                onUpdateWidget={onUpdateWidget}
                onRemoveWidget={removeFromPopover}
              />
            ))}
            {live?.blocked != null && (
              <PreviewOutline
                rect={live.blocked.rect}
                tone="blocked"
                label={live.blocked.label}
              />
            )}
            {live?.split != null && (
              <PreviewOutline
                rect={live.split.rect}
                tone="ok"
                label={nameOf(live.split.type)}
              />
            )}
            {drop !== null && drop.plan.kind !== "blocked" && (
              <PreviewOutline rect={drop.plan.added} tone="ok" label={nameOf(drop.type)} />
            )}
            {drop !== null && drop.plan.kind === "blocked" && (
              <PreviewOutline
                rect={{
                  x: Math.min(Math.floor(drop.point.x), GRID.cols - 1),
                  y: Math.min(Math.floor(drop.point.y), GRID.rows - 1),
                  w: 1,
                  h: 1,
                }}
                tone="blocked"
                label="Kein Platz"
              />
            )}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[2.5%] items-center justify-center bg-muted text-[10px] text-muted-foreground">
          Statusleiste (immer sichtbar)
        </div>
      </div>
    </div>
  )
}
