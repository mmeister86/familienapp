import { useCallback, useEffect, useState } from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "../../../convex/_generated/api"
import type {
  SceneStart,
  SceneWidget,
} from "../../../convex/lib/validators"

export type ScenesList = FunctionReturnType<typeof api.dashboardScenes.list>
export type SceneRow = ScenesList["scenes"][number]

export type SceneForm = {
  name: string
  start: SceneStart
  widgets: SceneWidget[]
}

export type SaveStatus = "saved" | "saving" | "error"

function snapshotOf(scene: SceneRow): SceneForm | null {
  if (scene.kind === "night") {
    return null
  }
  const snap = scene.draft ?? scene.published
  if (!snap) {
    return null
  }
  return { name: snap.name, start: { ...snap.start }, widgets: snap.widgets }
}

export function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "string"
  ) {
    return error.data
  }
  return error instanceof Error ? error.message : "Speichern fehlgeschlagen"
}

/**
 * Editing state for the selected scene: initialized from draft ?? published
 * on selection, autosaved (1 s debounce) while dirty. Null while nothing
 * (editable) is selected; night scenes have no draft.
 */
export function useSceneForm(
  token: string | null,
  scenes: SceneRow[] | undefined,
  selectedId: string | null,
) {
  const saveDraft = useMutation(api.dashboardScenes.saveDraft)
  const [form, setForm] = useState<SceneForm | null>(null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scene = scenes?.find((entry) => entry.sceneId === selectedId) ?? null

  // Reset on selection change (React's "adjust state when props change"
  // pattern, like the task editor): query updates while dirty never wipe
  // in-progress edits.
  const [session, setSession] = useState({ selectedId, scene })
  if (session.selectedId !== selectedId || (session.scene !== scene && !dirty)) {
    setSession({ selectedId, scene })
    setForm(scene ? snapshotOf(scene) : null)
    setDirty(false)
  }

  useEffect(() => {
    if (!dirty || !token || !selectedId || !form) {
      return
    }
    const timer = window.setTimeout(() => {
      saveDraft({
        token,
        sceneId: selectedId,
        name: form.name,
        start: form.start,
        widgets: form.widgets,
      }).then(
        () => {
          setDirty(false)
        },
        (e: unknown) => {
          setError(errorMessage(e))
        },
      )
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [dirty, token, selectedId, form, saveDraft])

  const updateForm = useCallback((patch: Partial<SceneForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
    setDirty(true)
    setError(null)
  }, [])

  const status: SaveStatus =
    error !== null ? "error" : dirty ? "saving" : "saved"
  return { scene, form, updateForm, saveStatus: status, saveError: error }
}
