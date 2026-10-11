import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ResponsiveDialog } from "@/components/responsive-dialog"
import { StartTimeField } from "./start-time-field"
import { errorMessage, type SceneRow } from "./use-scene-form"

export function NewSceneDialog({
  token,
  scenes,
  open,
  onOpenChange,
  onCreated,
}: {
  token: string | null
  scenes: SceneRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (sceneId: string) => void
}) {
  const createScene = useMutation(api.dashboardScenes.createScene)
  const [name, setName] = useState("")
  const [schoolDay, setSchoolDay] = useState<string | null>("15:30")
  const [weekend, setWeekend] = useState<string | null>(null)
  const [copyFrom, setCopyFrom] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const layouts = scenes.filter((scene) => scene.kind === "layout")

  // Reset on the closed -> open transition (render-phase pattern).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName("")
      setSchoolDay("15:30")
      setWeekend(null)
      setCopyFrom("")
      setError(null)
      setSaving(false)
    }
  }

  const handleCreate = (): void => {
    if (!token || saving) {
      return
    }
    if (name.trim() === "") {
      setError("Bitte einen Namen eingeben.")
      return
    }
    setSaving(true)
    setError(null)
    createScene({
      token,
      name: name.trim(),
      start: { schoolDay, weekend },
      ...(copyFrom === "" ? {} : { copyFrom }),
    }).then(
      (sceneId) => {
        onOpenChange(false)
        onCreated(sceneId)
      },
      (e: unknown) => {
        setSaving(false)
        setError(errorMessage(e))
      },
    )
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Neue Szene"
      description="Die Szene entsteht als Entwurf und erscheint erst nach dem Veröffentlichen auf der Wand."
    >
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Name</span>
        <Input
          value={name}
          maxLength={30}
          onChange={(event) => setName(event.target.value)}
          placeholder="z. B. Hausaufgaben"
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <StartTimeField
          day="schoolDay"
          label="Mo–Fr"
          value={schoolDay}
          onChange={setSchoolDay}
        />
        <StartTimeField
          day="weekend"
          label="Sa/So"
          value={weekend}
          onChange={setWeekend}
        />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">
          Start mit
        </span>
        <Select
          value={copyFrom === "" ? "empty" : copyFrom}
          onValueChange={(value) =>
            setCopyFrom(value === null || value === "empty" ? "" : value)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="empty">Leere Szene</SelectItem>
            {layouts.map((scene) => (
              <SelectItem key={scene.sceneId} value={scene.sceneId}>
                Kopie von {scene.draft?.name ?? scene.published?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Abbrechen
        </Button>
        <Button onClick={handleCreate} disabled={saving}>
          {saving ? "Wird angelegt …" : "Anlegen"}
        </Button>
      </div>
    </ResponsiveDialog>
  )
}
