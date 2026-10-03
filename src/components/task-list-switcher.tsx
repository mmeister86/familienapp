import { cn } from "cn"
import { NavLink } from "react-router"

const SEGMENTS = [
  { title: "Heute", url: "/" },
  { title: "Demnächst", url: "/upcoming" },
  { title: "Irgendwann", url: "/anytime" },
] as const

/**
 * Segmented control for the three task-list views on phones; tablet and
 * laptop reach them through the sidebar.
 */
export function TaskListSwitcher() {
  return (
    <nav aria-label="Aufgabenlisten" className="md:hidden">
      <ul className="grid grid-cols-3 rounded-[0.7rem] bg-muted p-0.5 dark:bg-secondary">
        {SEGMENTS.map((segment) => (
          <li key={segment.url}>
            <NavLink
              to={segment.url}
              end
              replace
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center justify-center rounded-[0.55rem] text-[0.8125rem] font-medium outline-none transition-[background-color,box-shadow,color] duration-200 focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgb(24_32_58/0.12),0_0_0_0.5px_rgb(24_32_58/0.06)] dark:bg-muted-foreground/30"
                    : "text-muted-foreground",
                )
              }
            >
              {segment.title}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
