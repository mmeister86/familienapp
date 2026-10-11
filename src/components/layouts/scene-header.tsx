import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/switch"
import type { SceneStart } from "../../../convex/lib/validators"
import {
  daySegments,
  type DayKind,
  type DaySegment,
  type SceneScheduleInput,
} from "@/lib/scene-schedule"
import type { SceneRow } from "./use-scene-form"

function formatMinute(min: number): string {
  const hours = Math.floor(min / 60)
  const minutes = min % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function DayBar({
  label,
  segments,
  selectedId,
}: {
  label: string
  segments: DaySegment[]
  selectedId: string
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted">
        {segments.map((segment) => (
          <div
            key={`${segment.sceneId}-${segment.fromMin}`}
            title={`${segment.name}: ${formatMinute(segment.fromMin)}–${formatMinute(segment.toMin)}`}
            style={{
              width: `${((segment.toMin - segment.fromMin) / 1440) * 100}%`,
            }}
            className={
              segment.sceneId === selectedId
                ? "bg-primary"
                : "bg-muted-foreground/40"
            }
          />
        ))}
      </div>
    </div>
  )
}

const DAY_FIELDS: { day: DayKind; label: string }[] = [
  { day: "schoolDay", label: "Mo–Fr" },
  { day: "weekend", label: "Sa/So" },
]

export function SceneHeader({
  scene,
  name,
  start,
  onNameChange,
  onStartChange,
  barScenes,
  error,
}: {
  scene: SceneRow
  name: string
  start: SceneStart
  /** Null for the night scene (fixed name). */
  onNameChange: ((name: string) => void) | null
  onStartChange: (day: DayKind, value: string | null) => void
  /** Published stands, with the selected scene's edited values. */
  barScenes: SceneScheduleInput[]
  error: string | null
}) {
  // Restores the previous time when a day is switched back on.
  const lastTimes = useRef({ schoolDay: "06:45", weekend: "07:30" })
  useEffect(() => {
    if (start.schoolDay !== null) {
      lastTimes.current.schoolDay = start.schoolDay
    }
    if (start.weekend !== null) {
      lastTimes.current.weekend = start.weekend
    }
  }, [start])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {onNameChange === null ? (
          <div className="text-lg font-semibold">{name}</div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">
              Name
            </span>
            <Input
              value={name}
              maxLength={30}
              onChange={(event) => onNameChange(event.target.value)}
              className="w-56"
            />
          </label>
        )}
        {DAY_FIELDS.map(({ day, label }) => (
          <div key={day} className="flex items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">
                {label}
              </span>
              <Input
                type="time"
                value={start[day] ?? ""}
                disabled={start[day] === null}
                onChange={(event) =>
                  onStartChange(day, event.target.value || null)
                }
                className="w-32"
              />
            </label>
            <Switch
              checked={start[day] !== null}
              onCheckedChange={(checked) =>
                onStartChange(
                  day,
                  checked ? lastTimes.current[day] : null,
                )
              }
              label={`${label} ein- oder ausschalten`}
            />
          </div>
        ))}
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
        <DayBar
          label="Mo–Fr"
          segments={daySegments(barScenes, "schoolDay")}
          selectedId={scene.sceneId}
        />
        <DayBar
          label="Sa/So"
          segments={daySegments(barScenes, "weekend")}
          selectedId={scene.sceneId}
        />
      </div>
    </div>
  )
}
