import { cn } from "cn"
import { Link, useLocation } from "react-router"
import { isNavItemActive, navItems } from "@/lib/nav"

/** Phone-only bottom navigation (`md` and up use the sidebar). */
export function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="no-scrollbar flex items-stretch gap-1 overflow-x-auto px-1 py-1">
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname)

          return (
            <li key={item.url} className="min-w-16 flex-1">
              <Link
                to={item.url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-primary/10 text-primary",
                )}
              >
                <item.icon className="size-5" />
                <span className="max-w-full truncate">{item.title}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
