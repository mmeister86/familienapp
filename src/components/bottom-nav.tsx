import { cn } from "cn"
import { useEffect, useRef } from "react"
import { Link, useLocation } from "react-router"
import { useSession } from "@/hooks/useSession"
import { isNavItemActive, isNavItemVisible, navItems } from "@/lib/nav"

/** Phone-only bottom navigation (`md` and up use the sidebar). */
export function BottomNav() {
  const { pathname } = useLocation()
  const { user } = useSession()
  const activeRef = useRef<HTMLLIElement>(null)
  // Unknown/loading role renders no destinations (see isNavItemVisible) so
  // parent items never flash to kids while the session resolves.
  const visibleItems = navItems.filter((item) =>
    isNavItemVisible(item, user?.role),
  )

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    })
  }, [pathname])

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="no-scrollbar flex items-stretch gap-1 overflow-x-auto px-1 py-1">
        {visibleItems.map((item) => {
          const active = isNavItemActive(item, pathname)

          return (
            <li
              key={item.url}
              ref={active ? activeRef : undefined}
              className="shrink-0"
            >
              <Link
                to={item.url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-primary/10 text-primary",
                )}
              >
                <item.icon className="size-5" />
                <span>{item.title}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
