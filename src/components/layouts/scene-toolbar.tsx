import { useEffect, useState } from "react"
import {
  Check,
  CircleAlert,
  Loader2,
  MonitorUp,
  Redo2,
  Undo2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SceneMoreMenu } from "./scene-more-menu"
import type { SaveStatus } from "./use-scene-form"

function formatCountdown(until: number, now: number): string {
  const remaining = Math.max(0, Math.ceil((until - now) / 1000))
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
}

function SaveState({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Speichert …
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-destructive">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        Fehler beim Speichern
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
      <Check className="size-3.5" aria-hidden="true" />
      Gespeichert
    </span>
  )
}

/** Top bar of the editor frame: scene state on the left, actions on the right. */
export function SceneToolbar({
  name,
  saveStatus,
  hasDraft,
  isNight,
  isSeeded,
  busy,
  previewUntil,
  onPublish,
  onDiscard,
  onPreview,
  onOpenVersions,
  onResetDefault,
  onDelete,
  canUndo,
  canRedo,
  canClear,
  onUndo,
  onRedo,
  onClear,
}: {
  name: string
  saveStatus: SaveStatus
  hasDraft: boolean
  isNight: boolean
  isSeeded: boolean
  /** Autosave in flight: destructive actions wait to avoid clobbering it. */
  busy: boolean
  previewUntil: number | null
  onPublish: () => void
  onDiscard: () => void
  onPreview: () => void
  onOpenVersions: () => void
  onResetDefault: () => void
  onDelete: () => void
  canUndo: boolean
  canRedo: boolean
  /** False for the night scene and scenes without tiles. */
  canClear: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (previewUntil === null) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [previewUntil])

  const previewActive = previewUntil !== null && previewUntil > now

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate font-semibold">{name}</span>
        {hasDraft ? (
          <span className="flex items-center gap-1.5 text-sm whitespace-nowrap">
            <span
              className="size-1.5 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            Entwurf
          </span>
        ) : (
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            Veröffentlicht
          </span>
        )}
        <SaveState status={saveStatus} />
        {previewActive && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary">
            An der Wand {formatCountdown(previewUntil, now)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label="Rückgängig"
            title="Rückgängig (Strg+Z)"
          >
            <Undo2 aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label="Wiederholen"
            title="Wiederholen (Strg+Umschalt+Z)"
          >
            <Redo2 aria-hidden="true" />
          </Button>
        </div>
        <Separator orientation="vertical" className="h-5 self-center" />
        <Button
          variant="outline"
          disabled={isNight}
          onClick={onPreview}
          title="2 Minuten an der Wand zeigen"
        >
          <MonitorUp aria-hidden="true" />
          Vorschau
        </Button>
        <Button
          variant="ghost"
          disabled={!hasDraft || isNight || busy}
          onClick={onDiscard}
        >
          Verwerfen
        </Button>
        <Button
          onClick={onPublish}
          disabled={!hasDraft || isNight || saveStatus !== "saved"}
        >
          Veröffentlichen
        </Button>
        <SceneMoreMenu
          isNight={isNight}
          isSeeded={isSeeded}
          busy={busy}
          canClear={canClear}
          onOpenVersions={onOpenVersions}
          onResetDefault={onResetDefault}
          onClear={onClear}
          onDelete={onDelete}
        />
      </div>
    </>
  )
}
