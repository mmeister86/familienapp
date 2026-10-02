import { Star } from "lucide-react"

// Native select/textarea styled like the Input primitive (no shadcn
// select/textarea components in the repo; native controls are fully
// keyboard- and touch-accessible). Shared by task-editor and approvals.
export const nativeFieldClassName =
  "block w-full rounded-lg border border-border bg-input px-3 py-[.8rem] text-base placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:pointer-events-none disabled:opacity-50"

type AssigneeChipProps = {
  name: string | undefined
  emoji: string | undefined
}

// Assignee pill: emoji + name, or "Familie" for family-wide tasks.
export function AssigneeChip({ name, emoji }: AssigneeChipProps) {
  if (name === undefined) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
        Familie
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      <span aria-hidden="true">{emoji}</span>
      {name}
    </span>
  )
}

// Points pill with a screen-reader label ("5 Punkte" instead of "star 5").
export function PointsChip({ points }: { points: number }) {
  return (
    <span
      role="img"
      aria-label={`${String(points)} Punkte`}
      className="inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
    >
      <Star aria-hidden="true" className="size-3" />
      {points}
    </span>
  )
}
