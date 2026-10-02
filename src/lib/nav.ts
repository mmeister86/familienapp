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

export type NavRole = "parent" | "child"

export type NavItem = {
  /** German label shown in the navigation. */
  title: string
  /** Router path. */
  url: string
  icon: LucideIcon
  /** Roles allowed to see this destination. Omitted = visible to everyone. */
  roles?: NavRole[]
}

/**
 * Destinations of the app shell. Parent-only destinations (overview, approvals,
 * tasks, points) are gated by role; today/anytime/upcoming/rewards stay
 * visible to everyone (kids need rewards in Phase 4).
 */
export const navItems: NavItem[] = [
  { title: "Heute", url: "/", icon: CalendarDays },
  { title: "Anytime", url: "/anytime", icon: Clock },
  { title: "Upcoming", url: "/upcoming", icon: CalendarClock },
  { title: "Übersicht", url: "/overview", icon: LayoutDashboard, roles: ["parent"] },
  { title: "Freigaben", url: "/approvals", icon: CircleCheckBig, roles: ["parent"] },
  { title: "Aufgaben", url: "/tasks", icon: ListTodo, roles: ["parent"] },
  { title: "Belohnungen", url: "/rewards", icon: Gift },
  { title: "Punkte", url: "/points", icon: Trophy, roles: ["parent"] },
]

// Unknown/loading role hides everything so parent items never flash to kids
// while the session is still resolving.
export function isNavItemVisible(
  item: NavItem,
  role: NavRole | undefined,
): boolean {
  if (role === undefined) {
    return false
  }
  return item.roles === undefined || item.roles.includes(role)
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.url === "/") {
    return pathname === "/"
  }

  return pathname === item.url || pathname.startsWith(`${item.url}/`)
}
