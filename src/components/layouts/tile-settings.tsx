import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/switch"
import type { CatalogEntry } from "@/lib/scene-layout"
import type {
  SceneWidget,
  WidgetProps,
} from "../../../convex/lib/validators"
import { LabeledSelect } from "./labeled-select"

export function TileSettings({
  widget,
  displayName,
  catalog,
  onUpdate,
  onRemove,
}: {
  widget: SceneWidget
  displayName: string
  catalog: readonly CatalogEntry[]
  onUpdate: (id: string, patch: Partial<SceneWidget>) => void
  onRemove: (id: string) => void
}) {
  const props: WidgetProps = widget.props ?? {}
  const setProps = (patch: Partial<WidgetProps>): void => {
    onUpdate(widget.id, { props: { ...props, ...patch } })
  }

  return (
    <Popover>
      <PopoverTrigger
        className="tile-gear absolute top-1 right-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`${displayName} einrichten`}
      >
        <Settings className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="text-sm font-medium">{displayName}</div>
        {widget.type === "clock" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Breit</span>
              <Switch
                checked={props.wide === true}
                onCheckedChange={(checked) => setProps({ wide: checked })}
                label="Breite Uhr"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">Wetter-Tipps</span>
              <Switch
                checked={props.hints === true}
                onCheckedChange={(checked) => setProps({ hints: checked })}
                label="Wetter-Tipps für den Schulweg"
              />
            </div>
          </div>
        )}
        {widget.type === "briefing" && (
          <LabeledSelect
            label="Briefing"
            value={props.kind ?? "today"}
            options={[
              { value: "today", label: "Tagesbriefing" },
              { value: "tomorrow", label: "Vorausschau" },
            ]}
            onChange={(value) =>
              setProps({ kind: value === "tomorrow" ? "tomorrow" : "today" })
            }
          />
        )}
        {widget.type === "school" && (
          <div className="space-y-2">
            <LabeledSelect
              label="Ansicht"
              value={props.mode ?? "plan-meal"}
              options={[
                { value: "full", label: "Alles" },
                { value: "plan", label: "Stundenplan" },
                { value: "plan-meal", label: "Plan + Essen" },
              ]}
              onChange={(value) =>
                setProps({
                  mode:
                    value === "full" || value === "plan" ? value : "plan-meal",
                })
              }
            />
            <LabeledSelect
              label="Essen"
              value={props.mealDay ?? "today"}
              options={[
                { value: "today", label: "Essen heute" },
                { value: "tomorrow", label: "Essen morgen" },
              ]}
              onChange={(value) =>
                setProps({
                  mealDay: value === "tomorrow" ? "tomorrow" : "today",
                })
              }
            />
          </div>
        )}
        <LabeledSelect
          label="Fallback bei leerem Widget"
          value={widget.fallback ?? "none"}
          options={[
            { value: "none", label: "Kein Fallback" },
            ...catalog
              // Mirror of the server rule: briefing/school need their own
              // settings, so they cannot serve as fallback.
              .filter(
                (entry) =>
                  entry.type !== widget.type &&
                  entry.type !== "briefing" &&
                  entry.type !== "school",
              )
              .map((entry) => ({ value: entry.type, label: entry.name })),
          ]}
          onChange={(value) =>
            onUpdate(widget.id, {
              fallback: value === "none" ? undefined : value,
            })
          }
        />
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => onRemove(widget.id)}
        >
          Entfernen
        </Button>
      </PopoverContent>
    </Popover>
  )
}
