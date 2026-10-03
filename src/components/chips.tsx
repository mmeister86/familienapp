import { cn } from "cn"
import { Star } from "lucide-react"
import { Avatar } from "@/components/avatar"

// Native select/textarea styled like the Input primitive (no shadcn
// select/textarea components in the repo; native controls are fully
// keyboard- and touch-accessible). Shared by task-editor and approvals.
export const nativeFieldClassName =
  "block w-full rounded-xl border border-border bg-input px-3.5 py-3 text-base placeholder:text-muted-foreground transition-colors focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/20 focus:outline-none disabled:pointer-events-none disabled:opacity-50"

type AssigneeChipProps = {
  name: string | undefined
  emoji: string | undefined
  color?: string
}

// Assignee pill: avatar + name, or "Familie" for family-wide tasks.
export function AssigneeChip({ name, emoji, color }: AssigneeChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-0.5 text-xs font-medium">
      <Avatar emoji={emoji} color={color} size="xs" />
      {name ?? "Familie"}
    </span>
  )
}

// Points pill with a screen-reader label ("5 Punkte" instead of "star 5").
// Gold is reserved for points and rewards throughout the app.
export function PointsChip({
  points,
  className,
}: {
  points: number
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={`${String(points)} Punkte`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold-foreground tabular-nums dark:text-gold",
        className,
      )}
    >
      <Star aria-hidden="true" className="size-3 fill-gold text-gold" />
      {points}
    </span>
  )
}
