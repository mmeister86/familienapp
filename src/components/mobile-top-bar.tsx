import { cn } from "cn"
import { useLocation } from "react-router"
import { Avatar } from "@/components/avatar"
import { useSession } from "@/hooks/useSession"
import { titleForPath } from "@/lib/nav"
import { usePageTitle } from "@/lib/page-title"

/**
 * Phone top bar (below `md`). Transparent over the large page title; once
 * the title scrolls away it gets a blurred background and shows a compact
 * centred title. The avatar on the right shows who is signed in (shared
 * family devices) and opens the "Mehr" sheet.
 */
export function MobileTopBar({ onOpenMore }: { onOpenMore: () => void }) {
  const { pathname } = useLocation()
  const { user } = useSession()
  const { largeTitleHidden } = usePageTitle()

  return (
    <header
      className={cn(
        "sticky top-0 z-20 pt-safe transition-[background-color,border-color] duration-200 md:hidden",
        largeTitleHidden
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-background",
      )}
    >
      <div className="grid h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center px-3">
        <span aria-hidden="true" />
        <p
          aria-hidden={!largeTitleHidden}
          className={cn(
            "truncate text-center text-[1.0625rem] font-semibold tracking-tight transition-[opacity,transform] duration-200",
            largeTitleHidden
              ? "translate-y-0 opacity-100"
              : "translate-y-1 opacity-0",
          )}
        >
          {titleForPath(pathname)}
        </p>
        {user !== undefined ? (
          <button
            type="button"
            onClick={onOpenMore}
            aria-label={`Angemeldet als ${user.name}. Profil und Einstellungen öffnen`}
            className="pressable flex size-11 items-center justify-center justify-self-end rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Avatar emoji={user.emoji} color={user.color} size="sm" />
          </button>
        ) : null}
      </div>
    </header>
  )
}
