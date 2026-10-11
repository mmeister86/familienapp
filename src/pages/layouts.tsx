import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useSession } from "@/hooks/useSession"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { DayKind } from "@/lib/scene-schedule"
import type { SceneStart } from "../../convex/lib/validators"
import { SceneHeader } from "@/components/layouts/scene-header"
import { SceneTabs } from "@/components/layouts/scene-tabs"
import { useSceneForm } from "@/components/layouts/use-scene-form"

export function LayoutsPage() {
  const { token } = useSession()
  const data = useQuery(api.dashboardScenes.list, token ? { token } : "skip")
  const setNightStart = useMutation(api.dashboardScenes.setNightStart)
  const [explicitId, setExplicitId] = useState<string | null>(null)
  const [nightError, setNightError] = useState<string | null>(null)

  const scenes = data?.scenes
  const selectedId =
    explicitId !== null && scenes?.some((s) => s.sceneId === explicitId)
      ? explicitId
      : (scenes?.[0]?.sceneId ?? null)
  const { scene, form, updateForm } = useSceneForm(token, scenes, selectedId)

  if (!token || !scenes) {
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
        () => setNightError(null),
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
      <p className="text-sm text-muted-foreground">
        {scene.kind === "night"
          ? "Nacht-Vorschau folgt."
          : "Raster und Werkzeugleiste folgen."}
      </p>
    </section>
  )
}
