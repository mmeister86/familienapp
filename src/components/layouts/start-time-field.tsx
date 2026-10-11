import { useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/switch"
import type { DayKind } from "@/lib/scene-schedule"

const FALLBACK_TIMES: Record<DayKind, string> = {
  schoolDay: "06:45",
  weekend: "07:30",
}

/** Start time with an on/off switch; remembers the last time set. */
export function StartTimeField({
  day,
  label,
  value,
  onChange,
}: {
  day: DayKind
  label: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  const lastTime = useRef(FALLBACK_TIMES[day])
  useEffect(() => {
    if (value !== null) {
      lastTime.current = value
    }
  }, [value])

  return (
    <div className="flex items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
        <Input
          type="time"
          value={value ?? ""}
          disabled={value === null}
          onChange={(event) => onChange(event.target.value || null)}
          className="w-32"
        />
      </label>
      <Switch
        checked={value !== null}
        onCheckedChange={(checked) =>
          onChange(checked ? lastTime.current : null)
        }
        label={`${label} ein- oder ausschalten`}
      />
    </div>
  )
}
