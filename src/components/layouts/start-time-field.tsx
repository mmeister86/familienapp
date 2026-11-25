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
    <div className="flex items-end gap-2 xl:items-center">
      <label className="flex min-w-0 flex-1 flex-col gap-1 xl:flex-row xl:items-center xl:gap-2">
        <span className="shrink-0 xl:w-10 text-xs text-muted-foreground">
          {label}
        </span>
        <Input
          type="time"
          value={value ?? ""}
          disabled={value === null}
          onChange={(event) => onChange(event.target.value || null)}
          className="min-w-0 xl:flex-1 px-2.5 text-sm xl:px-2"
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
