import type { LucideIcon } from "lucide-react"
import {
  CalendarClock,
  CalendarDays,
  CircleCheckBig,
  Gift,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Trophy,
} from "lucide-react"

export type NavRole = "parent" | "child"

/** Sidebar sections (desktop). Order of this list is the render order. */
export type NavGroup = "plan" | "rewards" | "manage"

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  plan: "Planen",
  rewards: "Punkte & Belohnungen",
  manage: "Verwalten",
}

export const NAV_GROUP_ORDER: NavGroup[] = ["plan", "rewards", "manage"]

export type NavItem = {
  /** German label shown in the navigation. */
  title: string
  /** Router path. */
  url: string
  icon: LucideIcon
  group: NavGroup
  /** Roles allowed to see this destination. Omitted = visible to everyone. */
  roles?: NavRole[]
}

/**
 * Every destination of the app shell. Parent-only destinations (overview,
 * approvals, tasks) are gated by role; the task lists, rewards and points stay
 * visible to everyone (the points page renders the kid's own history).
 */
export const navItems: NavItem[] = [
  {
    title: "Übersicht",
    url: "/overview",
    icon: LayoutDashboard,
    group: "plan",
    roles: ["parent"],
  },
  { title: "Heute", url: "/", icon: CalendarDays, group: "plan" },
  { title: "Demnächst", url: "/upcoming", icon: CalendarClock, group: "plan" },
  { title: "Irgendwann", url: "/anytime", icon: Inbox, group: "plan" },
  {
    title: "Freigaben",
    url: "/approvals",
    icon: CircleCheckBig,
    group: "rewards",
    roles: ["parent"],
  },
  { title: "Belohnungen", url: "/rewards", icon: Gift, group: "rewards" },
  { title: "Punkte", url: "/points", icon: Trophy, group: "rewards" },
  {
    title: "Aufgaben",
    url: "/tasks",
    icon: ListTodo,
    group: "manage",
    roles: ["parent"],
  },
]

/** The three task-list views share one tab and a segmented switcher. */
export const TASK_LIST_URLS = ["/", "/upcoming", "/anytime"] as const

export type TabItem = {
  title: string
  url: string
  icon: LucideIcon
  /** Extra paths that keep this tab highlighted. */
  alsoActiveOn?: readonly string[]
}

const PARENT_TABS: TabItem[] = [
  { title: "Übersicht", url: "/overview", icon: LayoutDashboard },
  {
    title: "Heute",
    url: "/",
    icon: CalendarDays,
    alsoActiveOn: TASK_LIST_URLS,
  },
  { title: "Freigaben", url: "/approvals", icon: CircleCheckBig },
  { title: "Aufgaben", url: "/tasks", icon: ListTodo },
]

const CHILD_TABS: TabItem[] = [
  {
    title: "Heute",
    url: "/",
    icon: CalendarDays,
    alsoActiveOn: TASK_LIST_URLS,
  },
  { title: "Belohnungen", url: "/rewards", icon: Gift },
  { title: "Punkte", url: "/points", icon: Trophy },
]

/**
 * Bottom tab bar destinations on phones (max. four plus "Mehr"). Unknown or
 * loading role returns none so parent tabs never flash to kids.
 */
export function tabItemsFor(role: NavRole | undefined): TabItem[] {
  if (role === undefined) {
    return []
  }
  return role === "parent" ? PARENT_TABS : CHILD_TABS
}

/**
 * Destinations that do not fit the tab bar; they live in the "Mehr" sheet.
 * The task-list views are excluded because the segmented switcher on the
 * Heute tab already reaches them.
 */
export function moreItemsFor(role: NavRole | undefined): NavItem[] {
  const tabUrls = new Set(tabItemsFor(role).map((tab) => tab.url))
  return navItems.filter(
    (item) =>
      isNavItemVisible(item, role) &&
      !tabUrls.has(item.url) &&
      !(TASK_LIST_URLS as readonly string[]).includes(item.url),
  )
}

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

export function isNavItemActive(
  item: { url: string; alsoActiveOn?: readonly string[] },
  pathname: string,
): boolean {
  const matches = (url: string): boolean =>
    url === "/"
      ? pathname === "/"
      : pathname === url || pathname.startsWith(`${url}/`)

  return matches(item.url) || (item.alsoActiveOn ?? []).some(matches)
}

/** Title of the destination for a path (used by the compact top bar). */
export function titleForPath(pathname: string): string {
  const item = navItems.find((entry) => isNavItemActive(entry, pathname))
  return item?.title ?? "Familienapp"
}
