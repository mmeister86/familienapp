import type { Transition } from "motion/react"

/** Shared by every tile whose rectangle changes: critically damped, no overshoot. */
export const TILE_SPRING: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 46,
  mass: 1,
}

/** Reduced motion, and a dragged tile that follows the pointer: apply at once. */
export const INSTANT: Transition = { duration: 0 }

/** The slot outline gliding between snap positions. */
export const OUTLINE_GLIDE: Transition = { duration: 0.12, ease: "easeOut" }

export const ENTER_SECONDS = 0.14
export const EXIT_SECONDS = 0.11
export const OUTLINE_FADE_SECONDS = 0.08
export const LIFT_SECONDS = 0.12
export const ENTER_SCALE = 0.96
export const LIFT_SCALE = 1.02

/** How long a released tile keeps its raised stacking while it glides home. */
export const SETTLE_MS = 300
