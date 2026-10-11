import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useSession } from "@/hooks/useSession"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { DayKind } from "@/lib/scene-schedule"
import {
  applyLayoutChange,
  defaultPropsFor,
} from "@/lib/scene-layout"
import type { Layout } from "react-grid-layout/legacy"
import type {
  SceneStart,
  SceneWidget,
} from "../../convex/lib/validators"
import { SceneCanvas } from "@/components/layouts/scene-canvas"
import { SceneHeader } from "@/components/layouts/scene-header"
import { SceneTabs } from "@/components/layouts/scene-tabs"
import { useSceneForm } from "@/components/layouts/use-scene-form"
import { WidgetSidebar } from "@/components/layouts/widget-sidebar"

function newWidgetId(existing: readonly string[]): string {
  let id: string
  do {
    id = `w${Math.random().toString(36).slice(2, 8)}`
  } while (existing.includes(id))
  return id
}

export function LayoutsPage() {
  const { token } = useSession()
  const data = useQuery(api.dashboardScenes.list, token ? { token } : "skip")
  const catalog = useQuery(
    api.dashboardScenes.catalog,
    token ? { token } : "skip",
  )
  const setNightStart = useMutation(api.dashboardScenes.setNightStart)
  const [explicitId, setExplicitId] = useState<string | null>(null)
  const [nightError, setNightError] = useState<string | null>(null)
  const [nightUndo, setNightUndo] = useState<SceneStart | null>(null)
  const draggedType = useRef<string | null>(null)

  useEffect(() => {
    if (!nightUndo) {
      return
    }
    const timer = window.setTimeout(() => setNightUndo(null), 10_000)
    return () => window.clearTimeout(timer)
  }, [nightUndo])

  const scenes = data?.scenes
  const selectedId =
    explicitId !== null && scenes?.some((s) => s.sceneId === explicitId)
      ? explicitId
      : (scenes?.[0]?.sceneId ?? null)
  const { scene, form, updateForm } = useSceneForm(token, scenes, selectedId)

  if (!token || !scenes || !catalog) {
    return (
      <section>
        <PageHeader
          title="Wand-Szenen"
          subtitle="Zeitplan und Kachel-Layouts für das Wanddisplay."
        />
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>
    )
  }

  if (!scene) {
    return (
      <section>
        <PageHeader
          title="Wand-Szenen"
          subtitle="Zeitplan und Kachel-Layouts für das Wanddisplay."
        />
        <p className="text-sm text-muted-foreground">
          Noch keine Szenen. Seed ausführen:{" "}
          <code>npx convex run dashboardScenes:seedDefaultScenes</code>
        </p>
      </section>
    )
  }

  const handleStartChange = (day: DayKind, value: string | null): void => {
    if (!token || !selectedId) {
      return
    }
    if (scene.kind === "night") {
      if (!scene.published) {
        return
      }
      const start: SceneStart = { ...scene.published.start, [day]: value }
      setNightStart({ token, start }).then(
        (old) => {
          setNightError(null)
          setNightUndo(old)
        },
        (e: unknown) =>
          setNightError(
            e instanceof Error ? e.message : "Speichern fehlgeschlagen",
          ),
      )
      return
    }
    if (!form) {
      return
    }
    updateForm({ start: { ...form.start, [day]: value } })
  }

  const handleNightUndo = (): void => {
    if (!token || !nightUndo) {
      return
    }
    setNightStart({ token, start: nightUndo }).then(
      () => {
        setNightUndo(null)
        setNightError(null)
      },
      (e: unknown) =>
        setNightError(
          e instanceof Error ? e.message : "Speichern fehlgeschlagen",
        ),
    )
  }

  const handleLayoutChange = (layout: Layout): void => {
    if (!form) {
      return
    }
    updateForm({ widgets: applyLayoutChange(form.widgets, layout) })
  }

  const handleDropWidget = (
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void => {
    if (!form || form.widgets.some((widget) => widget.type === type)) {
      return
    }
    const id = newWidgetId(form.widgets.map((widget) => widget.id))
    updateForm({
      widgets: [
        ...form.widgets,
        { id, type, x, y, w, h, props: defaultPropsFor(type) },
      ],
    })
  }

  const handleUpdateWidget = (
    id: string,
    patch: Partial<SceneWidget>,
  ): void => {
    if (!form) {
      return
    }
    updateForm({
      widgets: form.widgets.map((widget) => {
        if (widget.id !== id) {
          return widget
        }
        const next = { ...widget, ...patch }
        if (next.fallback === undefined) {
          delete next.fallback
        }
        return next
      }),
    })
  }

  const handleRemoveWidget = (id: string): void => {
    if (!form) {
      return
    }
    updateForm({ widgets: form.widgets.filter((widget) => widget.id !== id) })
  }

  const barScenes = scenes.flatMap((entry) => {
    if (entry.sceneId === selectedId) {
      const snap =
        form !== null
          ? { name: form.name, start: form.start }
          : (entry.published ?? entry.draft)
      if (!snap) {
        return []
      }
      return [{ sceneId: entry.sceneId, name: snap.name, start: snap.start }]
    }
    if (!entry.published) {
      return []
    }
    return [
      {
        sceneId: entry.sceneId,
        name: entry.published.name,
        start: entry.published.start,
      },
    ]
  })

  const headerName = form?.name ?? scene.published?.name ?? scene.draft?.name ?? ""
  const headerStart = form?.start ?? scene.published?.start ?? {
    schoolDay: null,
    weekend: null,
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Wand-Szenen"
        subtitle="Zeitplan und Kachel-Layouts für das Wanddisplay."
      />
      <SceneTabs scenes={scenes} selectedId={selectedId} onSelect={setExplicitId} />
      <SceneHeader
        scene={scene}
        name={headerName}
        start={headerStart}
        onNameChange={
          scene.kind === "night" ? null : (name) => updateForm({ name })
        }
        onStartChange={handleStartChange}
        barScenes={barScenes}
        error={nightError}
      />
      {scene.kind === "night" ? (
        <div className="max-w-[600px] space-y-3 rounded-xl border border-border bg-card p-6">
          <div className="text-sm font-medium">Nacht-Ansicht</div>
          <p className="text-sm text-muted-foreground">
            Uhr, Wetter, Hintergrundbild — die Ansicht selbst lässt sich nicht
            umbauen. Zeitänderungen gelten sofort.
          </p>
          {nightUndo !== null && (
            <div className="flex items-center gap-2">
              <span className="text-sm">Zeiten geändert.</span>
              <Button variant="outline" size="sm" onClick={handleNightUndo}>
                Rückgängig
              </Button>
            </div>
          )}
        </div>
      ) : (
        form !== null && (
          <div className="flex gap-6">
            <WidgetSidebar
              catalog={catalog}
              placedTypes={form.widgets.map((widget) => widget.type)}
              onDragStart={(type) => {
                draggedType.current = type
              }}
            />
            <div className="min-w-0 flex-1">
              <SceneCanvas
                widgets={form.widgets}
                catalog={catalog}
                draggedTypeRef={draggedType}
                onLayoutChange={handleLayoutChange}
                onDropWidget={handleDropWidget}
                onUpdateWidget={handleUpdateWidget}
                onRemoveWidget={handleRemoveWidget}
              />
            </div>
          </div>
        )
      )}
    </section>
  )
}
