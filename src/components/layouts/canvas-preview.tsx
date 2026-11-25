import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "cn"
import type { GridBox } from "./canvas-pointer"
import {
  INSTANT,
  OUTLINE_FADE_SECONDS,
  OUTLINE_GLIDE,
} from "./canvas-motion"

export type OutlineTone = "ok" | "blocked"

export type Outline = { box: GridBox; tone: OutlineTone; label?: string }

/** Dashed outline over the tile grid: green for what a move or drop would take, red for no room. Glides between positions. */
export function PreviewOutline({ outline }: { outline: Outline | null }) {
  const reduced = useReducedMotion() === true
  return (
    <AnimatePresence initial={false}>
      {outline !== null && (
        <motion.div
          key="outline"
          className={cn(
            "pointer-events-none absolute z-20 flex items-center justify-center rounded-xl border-2 border-dashed",
            outline.tone === "ok"
              ? "border-success bg-success/15 text-success"
              : "border-destructive bg-destructive/15 text-destructive",
          )}
          initial={{ ...outline.box, opacity: 0 }}
          animate={{ ...outline.box, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            reduced
              ? INSTANT
              : { default: OUTLINE_GLIDE, opacity: { duration: OUTLINE_FADE_SECONDS } }
          }
          data-testid={`preview-${outline.tone}`}
        >
          {outline.label !== undefined && (
            <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm">
              {outline.label}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
