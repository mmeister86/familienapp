import type { SceneForm } from "../components/layouts/use-scene-form"

/**
 * What to save right away when the selection leaves a scene: the previous
 * scene's id and form when it still has unsaved edits, otherwise null.
 */
export function pendingFlush(
  prev: { sceneId: string | null; dirty: boolean; form: SceneForm | null },
  nextSceneId: string | null,
): { sceneId: string; form: SceneForm } | null {
  if (
    !prev.dirty ||
    prev.sceneId === null ||
    prev.form === null ||
    prev.sceneId === nextSceneId
  ) {
    return null
  }
  return { sceneId: prev.sceneId, form: prev.form }
}
