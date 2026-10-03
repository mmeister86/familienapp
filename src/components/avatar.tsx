import { cn } from "cn"
import { Users } from "lucide-react"

type AvatarProps = {
  emoji?: string | null
  /** Person colour (hex). Omitted = neutral "Familie" avatar. */
  color?: string | null
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "size-5 text-[0.7rem]",
  sm: "size-7 text-sm",
  md: "size-9 text-lg",
  lg: "size-12 text-2xl",
  xl: "size-20 text-5xl",
}

/**
 * Round emoji avatar tinted with the person's colour. The family members'
 * colours are the main colour source of the UI, so they show up here.
 * Decorative: callers render the name as text next to it.
 */
export function Avatar({ emoji, color, size = "md", className }: AvatarProps) {
  const tinted = color !== undefined && color !== null && color !== ""
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none select-none",
        !tinted && "bg-muted text-muted-foreground",
        SIZES[size],
        className,
      )}
      style={
        tinted
          ? {
              backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
              boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${color} 45%, transparent)`,
            }
          : undefined
      }
    >
      {emoji ? emoji : <Users className="size-[55%]" />}
    </span>
  )
}
