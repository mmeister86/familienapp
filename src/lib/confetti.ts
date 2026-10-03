import confetti from "canvas-confetti"

// True when the OS/browser asks for reduced motion
// ("prefers-reduced-motion: reduce"). SSR-safe: guards mirror
// getDefaultSidebarOpen in app-shell.tsx.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// Small confetti burst for kids completing a task. Skipped entirely when
// reduced motion is requested (explicitly or via the media query); the canvas
// layer also sets disableForReducedMotion as a second safety net.
export function celebrateCompletion(opts?: { reducedMotion?: boolean }): void {
  const reducedMotion = opts?.reducedMotion ?? prefersReducedMotion()
  if (reducedMotion) {
    return
  }

  confetti({
    particleCount: 130,
    spread: 75,
    origin: { y: 0.6 },
    disableForReducedMotion: true,
  })
}
