import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ResponsiveDialog } from "@/components/responsive-dialog"
import { errorMessage } from "./use-scene-form"

function formatWhen(publishedAt: number): string {
  return new Date(publishedAt).toLocaleString("de-DE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function VersionHistory({
  token,
  sceneId,
  open,
  onOpenChange,
  disabled,
  onRestored,
}: {
  token: string | null
  sceneId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled: boolean
  onRestored: () => void
}) {
  const versions = useQuery(
    api.dashboardScenes.listVersions,
    token && open && sceneId ? { token, sceneId } : "skip",
  )
  const restoreVersion = useMutation(api.dashboardScenes.restoreVersion)
  const [error, setError] = useState<string | null>(null)

  const handleRestore = (versionId: Id<"dashboardSceneVersions">): void => {
    if (!token || !sceneId) {
      return
    }
    restoreVersion({ token, sceneId, versionId }).then(
      () => {
        setError(null)
        onOpenChange(false)
        onRestored()
      },
      (e: unknown) => setError(errorMessage(e)),
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Versionen"
      description="Die letzten 10 veröffentlichten Stände. Laden erzeugt einen Entwurf."
      dialogClassName="sm:max-w-lg"
    >
      {versions === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Versionen.
        </p>
      ) : (
        <ul className="space-y-2">
          {versions.map((version) => (
            <li
              key={version._id}
              className="flex items-center gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {version.snapshot.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatWhen(version.publishedAt)} ·{" "}
                  {version.publishedByName ?? "Unbekannt"}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => handleRestore(version._id)}
              >
                Als Entwurf laden
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </ResponsiveDialog>
  )
}
