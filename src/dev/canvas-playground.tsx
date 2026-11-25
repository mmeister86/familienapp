// Dev-only playground for the scene builder page: served by `pnpm dev` at
// /canvas-playground.html, not part of the production build. No Convex; the
// page chrome is composed from the real components with static demo scenes.
// Query: ?empty=1, ?demo=split|blocked, ?scheme=dark|light, ?scene=<sceneId>
// (e.g. night), ?state=error|preview.
import { StrictMode, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { CanvasStage, EditorFrame } from "@/components/layouts/editor-frame"
import { SceneHeader } from "@/components/layouts/scene-header"
import { SceneTabs } from "@/components/layouts/scene-tabs"
import { SceneToolbar } from "@/components/layouts/scene-toolbar"
import type { SceneRow } from "@/components/layouts/use-scene-form"
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
import { defaultPropsFor, headerPalette, type CatalogEntry } from "@/lib/scene-layout"
import { WIDGET_CATALOG } from "../../convex/lib/dashboardWidgets"
import { DEFAULT_SCENES, defaultScene } from "../../convex/lib/defaultScenes"
import type { SceneSnapshot, SceneWidget } from "../../convex/lib/validators"
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

const emptyScenes = params.get("empty") === "1"
const DRAFT_IDS = ["day", "evening"]

// Static stand-ins for the backend rows: Tag and Abend carry open drafts.
const DEMO_ROWS: SceneRow[] = DEFAULT_SCENES.map((def, index) => {
  const snapshot: SceneSnapshot = {
    name: def.name,
    start: { ...def.start },
    widgets: emptyScenes ? [] : def.widgets.map((widget) => ({ ...widget })),
    ...(def.palette !== undefined ? { palette: def.palette } : {}),
  }
  return {
    sceneId: def.sceneId,
    kind: def.kind,
    draft: DRAFT_IDS.includes(def.sceneId) ? snapshot : null,
    published: snapshot,
    updatedAt: index,
  }
})

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
  const [rows, setRows] = useState<SceneRow[]>(DEMO_ROWS)
  const [selectedId, setSelectedId] = useState(() => {
    const wanted = params.get("scene")
    return DEMO_ROWS.some((row) => row.sceneId === wanted)
      ? (wanted ?? "day")
      : "day"
  })
  const [history, setHistory] = useState<History<SceneWidget[]>>(emptyHistory)
  const draggedTypeRef = useRef<string | null>(null)

  const scene = rows.find((row) => row.sceneId === selectedId) ?? rows[0]
  const snap: SceneSnapshot | null = scene.draft ?? scene.published
  const widgets = snap?.widgets ?? []
  const isNight = scene.kind === "night"
  const failing = params.get("state") === "error"
  const [previewUntil] = useState(() =>
    params.get("state") === "preview" ? Date.now() + 102_000 : null,
  )

  const select = (sceneId: string): void => {
    setSelectedId(sceneId)
    setHistory(emptyHistory)
  }
  const patchSnapshot = (patch: Partial<SceneSnapshot>): void => {
    if (snap === null) {
      return
    }
    setRows((all) =>
      all.map((row) =>
        row.sceneId === scene.sceneId
          ? { ...row, draft: { ...snap, ...patch } }
          : row,
      ),
    )
  }
  const setWidgets = (next: SceneWidget[]): void => patchSnapshot({ widgets: next })
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
  const noop = (): void => {}

  const barScenes = rows.flatMap((row) => {
    const own = row.sceneId === scene.sceneId ? snap : row.published
    return own === null
      ? []
      : [{ sceneId: row.sceneId, name: own.name, start: own.start }]
  })
  const error = failing ? "Speichern fehlgeschlagen: Demo-Fehler." : null

  return (
    <div className="m-2 min-h-[calc(100vh-1rem)] rounded-2xl bg-background px-10 py-8 text-foreground">
      <section className="mx-auto w-full space-y-4">
        <PageHeader
          title="Wand-Szenen"
          subtitle="Zeitplan und Kachel-Layouts für das Wanddisplay."
          actions={
            <Button variant="outline" onClick={noop}>
              <Plus aria-hidden="true" />
              Neue Szene
            </Button>
          }
        />
        <SceneTabs scenes={rows} selectedId={selectedId} onSelect={select} />
        <EditorFrame
          topBar={
            <SceneToolbar
              name={snap?.name ?? ""}
              saveStatus={failing ? "error" : "saved"}
              hasDraft={scene.draft !== null}
              isNight={isNight}
              isSeeded={defaultScene(scene.sceneId) !== undefined}
              busy={false}
              previewUntil={previewUntil}
              onPublish={noop}
              onDiscard={noop}
              onPreview={noop}
              onOpenVersions={noop}
              onResetDefault={noop}
              onDelete={noop}
              canUndo={history.past.length > 0}
              canRedo={history.future.length > 0}
              canClear={!isNight && widgets.length > 0}
              onUndo={back}
              onRedo={forward}
              onClear={() => commit([])}
            />
          }
          alert={
            error !== null && (
              <p
                role="alert"
                className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )
          }
          library={
            isNight ? null : (
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
            )
          }
          workbench={
            isNight ? (
              <div className="flex min-h-[28rem] items-center">
                <div className="mx-auto w-full max-w-[600px] space-y-3 rounded-xl border border-border bg-card p-6">
                  <div className="text-sm font-medium">Nacht-Ansicht</div>
                  <p className="text-sm text-muted-foreground">
                    Uhr, Wetter, Hintergrundbild — die Ansicht selbst lässt sich
                    nicht umbauen. Zeitänderungen gelten sofort.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Zeiten geändert.</span>
                    <Button variant="outline" size="sm" onClick={noop}>
                      Rückgängig
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <CanvasStage>
                <FreeCanvas
                  key={selectedId}
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
              </CanvasStage>
            )
          }
          inspector={
            <SceneHeader
              scene={scene}
              name={snap?.name ?? ""}
              start={snap?.start ?? { schoolDay: null, weekend: null }}
              onNameChange={isNight ? null : (name) => patchSnapshot({ name })}
              onStartChange={(day, value) =>
                snap !== null &&
                patchSnapshot({ start: { ...snap.start, [day]: value } })
              }
              palette={headerPalette(snap, scene.published)}
              onPaletteChange={
                isNight ? null : (palette) => patchSnapshot({ palette })
              }
              barScenes={barScenes}
            />
          }
        />
      </section>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
)
