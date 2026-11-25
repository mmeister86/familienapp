import { cn } from "cn"
import type { Rect } from "@/lib/canvas-ops"

export type OutlineTone = "ok" | "blocked"

/** Dashed outline over the tile grid: green for what a drop would add, red for no room. */
export function PreviewOutline({
  rect,
  tone,
  label,
}: {
  rect: Rect
  tone: OutlineTone
  label?: string
}) {
  return (
    <div
      className={cn(
        "pointer-events-none relative z-20 flex items-center justify-center rounded-xl border-2 border-dashed",
        tone === "ok"
          ? "border-success bg-success/15 text-success"
          : "border-destructive bg-destructive/15 text-destructive",
      )}
      style={{
        gridColumn: `${rect.x + 1} / span ${rect.w}`,
        gridRow: `${rect.y + 1} / span ${rect.h}`,
      }}
      data-testid={`preview-${tone}`}
    >
      {label !== undefined && (
        <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm">
          {label}
        </span>
      )}
    </div>
  )
}
