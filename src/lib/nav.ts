import type { LucideIcon } from "lucide-react"
import {
  CalendarClock,
  CalendarDays,
  CircleCheckBig,
  Clock,
  Gift,
  LayoutDashboard,
  ListTodo,
  Trophy,
} from "lucide-react"

export type NavItem = {
  /** German label shown in the navigation. */
  title: string
  /** Router path. */
  url: string
  icon: LucideIcon
}

/**
 * Destinations of the app shell. Parent-only gating arrives in Phase 1; for now
 * every destination is visible to everyone.
 */
export const navItems: NavItem[] = [
  { title: "Heute", url: "/", icon: CalendarDays },
  { title: "Anytime", url: "/anytime", icon: Clock },
  { title: "Upcoming", url: "/upcoming", icon: CalendarClock },
  { title: "Übersicht", url: "/overview", icon: LayoutDashboard },
  { title: "Freigaben", url: "/approvals", icon: CircleCheckBig },
  { title: "Aufgaben", url: "/tasks", icon: ListTodo },
  { title: "Belohnungen", url: "/rewards", icon: Gift },
  { title: "Punkte", url: "/points", icon: Trophy },
]

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.url === "/") {
    return pathname === "/"
  }

  return pathname === item.url || pathname.startsWith(`${item.url}/`)
}
