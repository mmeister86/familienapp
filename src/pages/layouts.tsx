import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useSession } from "@/hooks/useSession"
import { useToasts } from "@/hooks/useToasts"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { DayKind } from "@/lib/scene-schedule"
import {
  applyLayoutChange,
  defaultPropsFor,
} from "@/lib/scene-layout"
import type { Layout } from "react-grid-layout/legacy"
import { defaultScene } from "../../convex/lib/defaultScenes"
import type {
  SceneStart,
  SceneWidget,
} from "../../convex/lib/validators"
import { ConfirmDialog } from "@/components/layouts/confirm-dialog"
import { NewSceneDialog } from "@/components/layouts/new-scene-dialog"
import { SceneCanvas } from "@/components/layouts/scene-canvas"
import { SceneHeader } from "@/components/layouts/scene-header"
import { SceneTabs } from "@/components/layouts/scene-tabs"
import { SceneToolbar } from "@/components/layouts/scene-toolbar"
import {
  errorMessage,
  useSceneForm,
} from "@/components/layouts/use-scene-form"
import { Toaster } from "@/components/layouts/toaster"
import { VersionHistory } from "@/components/layouts/version-history"
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
  const publishScene = useMutation(api.dashboardScenes.publish)
  const discardDraft = useMutation(api.dashboardScenes.discardDraft)
  const sendPreview = useMutation(api.dashboardScenes.sendPreview)
  const resetToDefault = useMutation(api.dashboardScenes.resetToDefault)
  const deleteScene = useMutation(api.dashboardScenes.deleteScene)
  const [explicitId, setExplicitId] = useState<string | null>(null)
  const [nightError, setNightError] = useState<string | null>(null)
  const [nightUndo, setNightUndo] = useState<SceneStart | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [previewUntil, setPreviewUntil] = useState<number | null>(null)
  const draggedType = useRef<string | null>(null)
  const { toasts, notify, dismiss } = useToasts()

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
  const { scene, form, updateForm, saveStatus, saveError } = useSceneForm(
    token,
    scenes,
    selectedId,
  )

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

  if (!scene || !selectedId) {
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

  const sceneId = selectedId

  const handleStartChange = (day: DayKind, value: string | null): void => {
    if (!token) {
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
        (e: unknown) => setNightError(errorMessage(e)),
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
      (e: unknown) => setNightError(errorMessage(e)),
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

  const withToken = <T,>(fn: (token: string) => Promise<T>): void => {
    if (!token) {
      return
    }
    void fn(token)
  }

  const handlePublish = (): void => {
    withToken(async (t) => {
      try {
        await publishScene({ token: t, sceneId })
        notify("success", "Veröffentlicht — die Wand übernimmt die Szene.")
      } catch (e: unknown) {
        notify("error", errorMessage(e))
      }
    })
  }

  const handleDiscard = (): void => {
    withToken(async (t) => {
      try {
        const result = await discardDraft({ token: t, sceneId })
        notify(
          "success",
          result.deleted ? "Szene gelöscht." : "Entwurf verworfen.",
        )
      } catch (e: unknown) {
        notify("error", errorMessage(e))
      }
    })
  }

  const handlePreview = (): void => {
    withToken(async (t) => {
      try {
        const result = await sendPreview({ token: t, sceneId })
        setPreviewUntil(result.until)
        notify("success", "Läuft 2 Minuten auf der Wand.")
      } catch (e: unknown) {
        notify("error", errorMessage(e))
      }
    })
  }

  const handleResetDefault = (): void => {
    withToken(async (t) => {
      try {
        await resetToDefault({ token: t, sceneId })
        notify("success", "Standard als Entwurf geladen.")
      } catch (e: unknown) {
        notify("error", errorMessage(e))
      }
    })
  }

  const handleDelete = (): void => {
    withToken(async (t) => {
      try {
        await deleteScene({ token: t, sceneId })
        notify("success", "Szene gelöscht.")
      } catch (e: unknown) {
        notify("error", errorMessage(e))
      }
    })
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
      <div className="flex items-center justify-between gap-4">
        <SceneTabs
          scenes={scenes}
          selectedId={selectedId}
          onSelect={setExplicitId}
        />
        <Button variant="outline" onClick={() => setNewOpen(true)}>
          Neue Szene
        </Button>
      </div>
      <SceneToolbar
        saveStatus={saveStatus}
        hasDraft={scene.draft !== null}
        isNight={scene.kind === "night"}
        isSeeded={defaultScene(sceneId) !== undefined}
        previewUntil={previewUntil}
        onPublish={handlePublish}
        onDiscard={() => setConfirmDiscard(true)}
        onPreview={handlePreview}
        onOpenVersions={() => setVersionsOpen(true)}
        onResetDefault={() => setConfirmReset(true)}
        onDelete={() => setConfirmDelete(true)}
      />
      <SceneHeader
        scene={scene}
        name={headerName}
        start={headerStart}
        onNameChange={
          scene.kind === "night" ? null : (name) => updateForm({ name })
        }
        onStartChange={handleStartChange}
        barScenes={barScenes}
        error={scene.kind === "night" ? nightError : saveError}
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
      <VersionHistory
        token={token}
        sceneId={selectedId}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        onRestored={() => notify("success", "Version als Entwurf geladen.")}
      />
      <NewSceneDialog
        token={token}
        scenes={scenes}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => {
          setExplicitId(id)
          notify("success", "Szene angelegt.")
        }}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Entwurf verwerfen?"
        message="Die ungespeicherten Änderungen gehen verloren."
        confirmLabel="Verwerfen"
        onConfirm={handleDiscard}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Standard laden?"
        message="Das eingebaute Layout ersetzt den aktuellen Entwurf."
        confirmLabel="Standard laden"
        onConfirm={handleResetDefault}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Szene löschen?"
        message="Die Szene verschwindet sofort von der Wand. Das lässt sich nicht rückgängig machen."
        confirmLabel="Löschen"
        onConfirm={handleDelete}
      />
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </section>
  )
}
