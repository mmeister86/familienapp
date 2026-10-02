import { ConvexReactClient } from "convex/react"

// Browser-facing Convex deployment URL. Dev: `npx convex dev` writes it into
// .env.local. Prod: it is baked into the bundle at build time via the
// `VITE_CONVEX_URL` Docker build arg (see README › Deploy).
const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  console.error(
    "[familienapp] VITE_CONVEX_URL is not set. " +
      "Add it to .env.local (dev, written by `npx convex dev`) or pass it as a " +
      "Docker build arg (prod) — see README › Deploy.",
  )
}

// Fall back to the local dev backend so a missing env var degrades to the
// console error above instead of crashing the whole app at import time.
export const convex = new ConvexReactClient(convexUrl || "http://127.0.0.1:3210")
