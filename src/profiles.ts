// Hardcoded family profiles. The login screen renders from this list with no
// backend call; the data mirrors the seeded users in convex/seed.ts.
export type Profile = {
  slug: string
  name: string
  role: "parent" | "child"
  color: string
  emoji: string
  pinLength: number
}

export const PROFILES: Profile[] = [
  {
    slug: "matthias",
    name: "Matthias",
    role: "parent",
    color: "#2563eb",
    emoji: "🧔",
    pinLength: 6,
  },
  {
    slug: "anica",
    name: "Anica",
    role: "parent",
    color: "#7c3aed",
    emoji: "👩",
    pinLength: 6,
  },
  {
    slug: "lukas",
    name: "Lukas",
    role: "child",
    color: "#16a34a",
    emoji: "🧒",
    pinLength: 4,
  },
  {
    slug: "hannah",
    name: "Hannah",
    role: "child",
    color: "#e11d48",
    emoji: "👧",
    pinLength: 4,
  },
]
