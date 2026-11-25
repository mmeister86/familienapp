// Dev-only playground for FreeCanvas: served by `pnpm dev` at
// /canvas-playground.html, not part of the production build. No Convex.
// Query: ?empty=1, ?demo=split|blocked, ?scheme=dark|light.
import { StrictMode, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Button } from "@/components/ui/button"
import { FreeCanvas } from "@/components/layouts/free-canvas"
import { WidgetSidebar } from "@/components/layouts/widget-sidebar"
import {
  applyDrop,
  minimaFrom,
  planClickAdd,
  removeTile,
  type DropPlan,
} from "@/lib/canvas-ops"
import {
  emptyHistory,
  record,
  redo,
  undo,
  type History,
} from "@/lib/history"
import { defaultPropsFor, type CatalogEntry } from "@/lib/scene-layout"
import { WIDGET_CATALOG } from "../../convex/lib/dashboardWidgets"
import { DEFAULT_SCENES } from "../../convex/lib/defaultScenes"
import type { SceneWidget } from "../../convex/lib/validators"
import "@/index.css"

const CATALOG: readonly CatalogEntry[] = WIDGET_CATALOG.map((def) => ({
  type: def.type,
  name: def.name,
  minW: def.minW,
  minH: def.minH,
}))
const MINIMA = minimaFrom(CATALOG)

const params = new URLSearchParams(window.location.search)
if (params.get("scheme") !== null) {
  document.documentElement.classList.toggle("dark", params.get("scheme") === "dark")
} else {
  document.documentElement.classList.toggle(
    "dark",
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  )
}

const afternoon =
  DEFAULT_SCENES.find((scene) => scene.sceneId === "afternoon")?.widgets ?? []
const initial: SceneWidget[] =
  params.get("empty") === "1" ? [] : afternoon.map((widget) => ({ ...widget }))

const DEMOS = {
  // Right half of the school tile (x 0..12, y 7..15).
  split: { type: "news", point: { x: 10, y: 10 } },
  // The shopping strip (y 22..24) is too small for anything else.
  blocked: { type: "briefing", point: { x: 6, y: 22.5 } },
} as const

function newWidgetId(existing: readonly string[]): string {
  let id: string
  do {
    id = `w${Math.random().toString(36).slice(2, 8)}`
  } while (existing.includes(id))
  return id
}

export function Playground() {
  const [widgets, setWidgets] = useState<SceneWidget[]>(initial)
  const [history, setHistory] = useState<History<SceneWidget[]>>(emptyHistory)
  const draggedTypeRef = useRef<string | null>(null)

  const commit = (next: SceneWidget[]): void => {
    setHistory(record(history, widgets))
    setWidgets(next)
  }
  const add = (type: string, plan: DropPlan): void => {
    const next = applyDrop(widgets, plan, {
      id: newWidgetId(widgets.map((w) => w.id)),
      type,
      props: defaultPropsFor(type),
    })
    if (next !== null) {
      commit(next)
    }
  }
  const back = (): void => {
    const result = undo(history, widgets)
    if (result) {
      setHistory(result.history)
      setWidgets(result.value)
    }
  }
  const forward = (): void => {
    const result = redo(history, widgets)
    if (result) {
      setHistory(result.history)
      setWidgets(result.value)
    }
  }
  const demo = params.get("demo")
  const forcedDrop = demo === "split" || demo === "blocked" ? DEMOS[demo] : undefined

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="mr-4 text-lg font-semibold">Canvas-Playground</h1>
        <Button variant="outline" onClick={back} disabled={history.past.length === 0}>
          Rückgängig
        </Button>
        <Button variant="outline" onClick={forward} disabled={history.future.length === 0}>
          Wiederholen
        </Button>
      </div>
      <div className="flex items-start gap-6">
        <WidgetSidebar
          catalog={CATALOG}
          placedTypes={widgets.map((w) => w.type)}
          onDragStart={(type) => {
            draggedTypeRef.current = type
          }}
          onDragEnd={() => {
            draggedTypeRef.current = null
          }}
          onAdd={(type) => {
            const plan = planClickAdd(widgets, type, MINIMA)
            if (plan.kind !== "blocked") {
              add(type, plan)
            }
          }}
        />
        <div className="min-w-0 flex-1">
          <FreeCanvas
            widgets={widgets}
            catalog={CATALOG}
            draggedTypeRef={draggedTypeRef}
            onChange={commit}
            onAddWidget={add}
            onUpdateWidget={(id, patch) =>
              commit(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)))
            }
            onRemoveWidget={(id) => commit(removeTile(widgets, id))}
            forcedDrop={forcedDrop}
          />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
)
