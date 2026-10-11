import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SceneRow } from "./use-scene-form"

export function SceneTabs({
  scenes,
  selectedId,
  onSelect,
}: {
  scenes: SceneRow[]
  selectedId: string | null
  onSelect: (sceneId: string) => void
}) {
  // Night sorts last by time already; keep it there explicitly.
  const ordered = [...scenes].sort(
    (a, b) => (a.kind === "night" ? 1 : 0) - (b.kind === "night" ? 1 : 0),
  )
  return (
    <Tabs value={selectedId ?? ""} onValueChange={onSelect}>
      <TabsList>
        {ordered.map((scene) => (
          <TabsTrigger key={scene.sceneId} value={scene.sceneId}>
            {scene.draft !== null && (
              <span
                aria-label="Offener Entwurf"
                className="size-1.5 rounded-full bg-amber-400"
              />
            )}
            {scene.draft?.name ?? scene.published?.name ?? "?"}
            {scene.published === null && (
              <span className="text-xs text-muted-foreground">Neu</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
