import { cn } from "cn"
import type { CatalogEntry } from "@/lib/scene-layout"
import { widgetIcon } from "./widget-icons"

export function WidgetSidebar({
  catalog,
  placedTypes,
  onDragStart,
}: {
  catalog: readonly CatalogEntry[] | undefined
  placedTypes: readonly string[]
  onDragStart: (type: string) => void
}) {
  return (
    <aside className="w-60 shrink-0">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Widgets
      </h2>
      <div className="space-y-2">
        {(catalog ?? []).map((entry) => {
          const placed = placedTypes.includes(entry.type)
          const Icon = widgetIcon(entry.type)
          return (
            <div
              key={entry.type}
              draggable={!placed}
              onDragStart={(event) => {
                // Firefox only fires drag events with data set; the type
                // itself travels via ref (dataTransfer is unreadable mid-drag).
                event.dataTransfer.setData("text/plain", entry.type)
                event.dataTransfer.effectAllowed = "copy"
                onDragStart(entry.type)
              }}
              aria-disabled={placed}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card p-3",
                placed ? "opacity-40" : "cursor-grab active:cursor-grabbing",
              )}
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{entry.name}</div>
                <div className="text-xs text-muted-foreground">
                  {placed
                    ? "platziert"
                    : `min. ${entry.minW} × ${entry.minH}`}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
