import { cn } from "cn"
import { Ellipsis } from "lucide-react"
import { Link, useLocation } from "react-router"
import { useApprovalsCount } from "@/hooks/useApprovalsCount"
import { useSession } from "@/hooks/useSession"
import { isNavItemActive, moreItemsFor, tabItemsFor } from "@/lib/nav"

function TabBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 left-[calc(50%+0.35rem)] flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] font-semibold text-white tabular-nums ring-2 ring-card"
    >
      {count}
    </span>
  )
}

const tabClassName =
  "pressable relative flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[0.6875rem] font-medium outline-none focus-visible:bg-muted"

/**
 * Phone tab bar (below `md`): up to four role-specific tabs plus "Mehr",
 * which opens a sheet with the remaining destinations, settings and sign-out.
 */
export function BottomNav({
  moreOpen,
  onOpenMore,
}: {
  moreOpen: boolean
  onOpenMore: () => void
}) {
  const { pathname } = useLocation()
  const { user } = useSession()
  const approvalsCount = useApprovalsCount()
  const tabs = tabItemsFor(user?.role)
  const moreActive = moreItemsFor(user?.role).some((item) =>
    isNavItemActive(item, pathname),
  )

  if (tabs.length === 0) {
    return null
  }

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/80 pb-safe backdrop-blur-xl backdrop-saturate-150 select-none md:hidden"
    >
      <ul
        className="grid h-[3.5rem] items-stretch px-2"
        style={{
          gridTemplateColumns: `repeat(${String(tabs.length + 1)}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((tab) => {
          const active = isNavItemActive(tab, pathname)
          const badge = tab.url === "/approvals" ? approvalsCount : 0
          return (
            <li key={tab.url}>
              <Link
                to={tab.url}
                aria-current={active ? "page" : undefined}
                aria-label={
                  badge > 0 ? `${tab.title}, ${String(badge)} offen` : undefined
                }
                className={cn(
                  tabClassName,
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200",
                    active && "bg-primary/10 dark:bg-primary/15",
                  )}
                >
                  <tab.icon
                    aria-hidden="true"
                    className="size-[1.375rem]"
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                  {badge > 0 ? <TabBadge count={badge} /> : null}
                </span>
                <span className={cn(active && "font-semibold")}>
                  {tab.title}
                </span>
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={onOpenMore}
            className={cn(
              tabClassName,
              "w-full",
              moreActive ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200",
                moreActive && "bg-primary/10 dark:bg-primary/15",
              )}
            >
              <Ellipsis
                aria-hidden="true"
                className="size-[1.375rem]"
                strokeWidth={moreActive ? 2.4 : 1.9}
              />
            </span>
            <span className={cn(moreActive && "font-semibold")}>Mehr</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
