import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "../../../convex/_generated/api"
import type {
  ScenePalette,
  SceneStart,
  SceneWidget,
} from "../../../convex/lib/validators"
import { emptyHistory, record, redo, undo, type History } from "@/lib/history"
import { pendingFlush } from "@/lib/pending-save"
import { sameWidgets } from "@/lib/scene-layout"

export type ScenesList = FunctionReturnType<typeof api.dashboardScenes.list>
export type SceneRow = ScenesList["scenes"][number]

export type SceneForm = {
  name: string
  start: SceneStart
  widgets: SceneWidget[]
  palette: ScenePalette | undefined
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
  return {
    name: snap.name,
    start: { ...snap.start },
    widgets: snap.widgets,
    palette: snap.palette,
  }
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

function saveArgs(token: string, sceneId: string, form: SceneForm) {
  return {
    token,
    sceneId,
    name: form.name,
    start: form.start,
    widgets: form.widgets,
    ...(form.palette === undefined ? {} : { palette: form.palette }),
  }
}

type FormState = {
  form: SceneForm | null
  /** Widget lists before layout changes; form and history change together. */
  history: History<SceneWidget[]>
}

type FormPatch = Partial<SceneForm> | ((prev: SceneForm) => Partial<SceneForm>)

/**
 * Editing state for the selected scene: initialized from draft ?? published
 * on selection, autosaved (1 s debounce) while dirty. Null while nothing
 * (editable) is selected; night scenes have no draft.
 *
 * Layout changes (`updateLayout`) are recorded in an undo history that
 * belongs to the open scene: it resets on selection change, on `revert`, and
 * when the server row of the same scene changes under a clean form (unless
 * it carries the widgets the form already has, i.e. our own saved draft).
 *
 * Two races are closed by construction: a save generation guard keeps a
 * resolving save from clearing edits typed while it was in flight, and
 * functional patches keep same-tick grid events (drop + layout change)
 * from overwriting each other.
 */
export function useSceneForm(
  token: string | null,
  scenes: SceneRow[] | undefined,
  selectedId: string | null,
) {
  const saveDraft = useMutation(api.dashboardScenes.saveDraft)
  const [{ form, history }, setCore] = useState<FormState>({
    form: null,
    history: emptyHistory(),
  })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saveSeq = useRef(0)
  // What the last committed render was editing, for the flush on leaving.
  const latest = useRef({ token, sceneId: selectedId, dirty: false, form })

  const scene = scenes?.find((entry) => entry.sceneId === selectedId) ?? null

  // Reset on selection change (React's "adjust state when props change"
  // pattern, like the task editor): query updates while dirty never wipe
  // in-progress edits.
  const [session, setSession] = useState({ selectedId, scene })
  if (session.selectedId !== selectedId || (session.scene !== scene && !dirty)) {
    const incoming = scene ? snapshotOf(scene) : null
    const keepHistory =
      session.selectedId === selectedId &&
      incoming !== null &&
      form !== null &&
      sameWidgets(incoming.widgets, form.widgets)
    setSession({ selectedId, scene })
    setCore({ form: incoming, history: keepHistory ? history : emptyHistory() })
    setDirty(false)
  }

  useEffect(() => {
    if (!dirty || !token || !selectedId || !form) {
      return
    }
    saveSeq.current += 1
    const fired = saveSeq.current
    const timer = window.setTimeout(() => {
      saveDraft(saveArgs(token, selectedId, form)).then(
        () => {
          // Another edit may have armed a newer save meanwhile.
          if (saveSeq.current === fired) {
            setDirty(false)
          }
          setError(null)
        },
        (e: unknown) => {
          setError(errorMessage(e))
        },
      )
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [dirty, token, selectedId, form, saveDraft])

  useEffect(() => {
    latest.current = { token, sceneId: selectedId, dirty, form }
  })

  // Leaving a scene (selection change or unmount) with unsaved edits sends
  // them right away for that scene instead of dropping the pending debounce.
  // Runs only when the id changes or on unmount, so the next id is "other".
  useEffect(() => {
    return () => {
      const { token: savedToken, ...prev } = latest.current
      const flush = pendingFlush(prev, null)
      if (!savedToken || !flush) {
        return
      }
      saveDraft(saveArgs(savedToken, flush.sceneId, flush.form)).catch(
        (e: unknown) => {
          setError(
            `Speichern der vorherigen Szene fehlgeschlagen: ${errorMessage(e)}`,
          )
        },
      )
    }
  }, [selectedId, saveDraft])

  const updateForm = useCallback((patch: FormPatch) => {
    setCore((prev) => {
      if (!prev.form) {
        return prev
      }
      const resolved = typeof patch === "function" ? patch(prev.form) : patch
      return { ...prev, form: { ...prev.form, ...resolved } }
    })
    setDirty(true)
  }, [])

  // Layout edits: remembers the widgets as they were, then applies the new list.
  const updateLayout = useCallback((next: SceneWidget[]) => {
    setCore((prev) =>
      prev.form
        ? {
            form: { ...prev.form, widgets: next },
            history: record(prev.history, prev.form.widgets),
          }
        : prev,
    )
    setDirty(true)
  }, [])

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const stepHistory = useCallback(
    (
      step: (
        history: History<SceneWidget[]>,
        current: SceneWidget[],
      ) => { history: History<SceneWidget[]>; value: SceneWidget[] } | null,
    ) => {
      const result = form ? step(history, form.widgets) : null
      if (!form || !result) {
        return
      }
      setCore({
        form: { ...form, widgets: result.value },
        history: result.history,
      })
      setDirty(true)
    },
    [form, history],
  )
  const undoLayout = useCallback(() => {
    if (canUndo) {
      stepHistory(undo)
    }
  }, [canUndo, stepHistory])
  const redoLayout = useCallback(() => {
    if (canRedo) {
      stepHistory(redo)
    }
  }, [canRedo, stepHistory])

  // Drops local edits and any pending save (after discard/reset/restore),
  // re-snapping to the passed server state and starting a fresh history.
  const revert = useCallback(
    (rows: SceneRow[] | undefined, id: string | null) => {
      const current = rows?.find((entry) => entry.sceneId === id) ?? null
      setCore({
        form: current ? snapshotOf(current) : null,
        history: emptyHistory(),
      })
      setDirty(false)
      setError(null)
      // Deliberately dropped edits must not be flushed when leaving.
      latest.current = { ...latest.current, dirty: false }
    },
    [],
  )

  const status: SaveStatus =
    error !== null ? "error" : dirty ? "saving" : "saved"
  return {
    scene,
    form,
    updateForm,
    updateLayout,
    undo: undoLayout,
    redo: redoLayout,
    canUndo,
    canRedo,
    revert,
    saveStatus: status,
    saveError: error,
  }
}
