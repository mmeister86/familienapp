import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { SaveStatus } from "./use-scene-form"

function formatCountdown(until: number, now: number): string {
  const remaining = Math.max(0, Math.ceil((until - now) / 1000))
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
}

export function SceneToolbar({
  saveStatus,
  hasDraft,
  isNight,
  isSeeded,
  previewUntil,
  onPublish,
  onDiscard,
  onPreview,
  onOpenVersions,
  onResetDefault,
  onDelete,
}: {
  saveStatus: SaveStatus
  hasDraft: boolean
  isNight: boolean
  isSeeded: boolean
  previewUntil: number | null
  onPublish: () => void
  onDiscard: () => void
  onPreview: () => void
  onOpenVersions: () => void
  onResetDefault: () => void
  onDelete: () => void
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {saveStatus === "saving"
          ? "Speichert …"
          : saveStatus === "error"
            ? "Fehler beim Speichern"
            : "Gespeichert"}
      </span>
      {previewActive && (
        <span className="text-sm font-medium text-primary">
          An der Wand ({formatCountdown(previewUntil, now)})
        </span>
      )}
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          onClick={onPublish}
          disabled={!hasDraft || isNight || saveStatus !== "saved"}
        >
          Veröffentlichen
        </Button>
        <Button
          variant="outline"
          disabled={!hasDraft || isNight}
          onClick={onDiscard}
        >
          Verwerfen
        </Button>
        <Button variant="outline" disabled={isNight} onClick={onPreview}>
          An die Wand (2 Min.)
        </Button>
        <Button variant="outline" disabled={isNight} onClick={onOpenVersions}>
          Versionen
        </Button>
        {isSeeded && !isNight && (
          <Button variant="outline" onClick={onResetDefault}>
            Standard laden
          </Button>
        )}
        {!isNight && (
          <Button variant="destructive" onClick={onDelete}>
            Szene löschen
          </Button>
        )}
      </div>
    </div>
  )
}
