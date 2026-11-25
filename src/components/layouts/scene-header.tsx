import { Input } from "@/components/ui/input"
import { LabeledSelect } from "./labeled-select"
import { StartTimeField } from "./start-time-field"
import type { ScenePalette, SceneStart } from "../../../convex/lib/validators"
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

const PALETTE_AUTO = "auto"
const PALETTE_LABELS: Record<ScenePalette, string> = {
  paper: "Papier (hell)",
  board: "Tafel (dunkel)",
}
const PALETTE_OPTIONS = [
  { value: PALETTE_AUTO, label: "Automatisch" },
  ...(Object.entries(PALETTE_LABELS) as [ScenePalette, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
]

function isPalette(value: string): value is ScenePalette {
  return value in PALETTE_LABELS
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
  palette,
  onPaletteChange,
  barScenes,
}: {
  scene: SceneRow
  name: string
  start: SceneStart
  /** Null for the night scene (fixed name). */
  onNameChange: ((name: string) => void) | null
  onStartChange: (day: DayKind, value: string | null) => void
  palette: ScenePalette | undefined
  /** Null for the night scene (no palette). */
  onPaletteChange: ((palette: ScenePalette | undefined) => void) | null
  /** Published stands, with the selected scene's edited values. */
  barScenes: SceneScheduleInput[]
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold">Szene</h2>
      <div className="mt-3 space-y-6">
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
              className="w-full"
            />
          </label>
        )}
        <div>
          <h3 className="mb-3 text-xs font-medium">Startzeit</h3>
          <div className="space-y-2">
            {DAY_FIELDS.map(({ day, label }) => (
              <StartTimeField
                key={day}
                day={day}
                label={label}
                value={start[day]}
                onChange={(value) => onStartChange(day, value)}
              />
            ))}
          </div>
        </div>
        {onPaletteChange !== null && (
          <LabeledSelect
            label="Farbwelt"
            value={palette ?? PALETTE_AUTO}
            options={PALETTE_OPTIONS}
            onChange={(value) =>
              onPaletteChange(isPalette(value) ? value : undefined)
            }
          />
        )}
        <div>
          <h3 className="mb-3 text-xs font-medium">Tagesablauf</h3>
          <div className="space-y-3">
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
          <p className="mt-2 text-xs text-muted-foreground">
            Hervorgehoben: diese Szene
          </p>
        </div>
      </div>
    </div>
  )
}
