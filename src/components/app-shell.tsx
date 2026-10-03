import { useEffect, useMemo, useRef, useState } from "react"
import { Outlet } from "react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { BottomNav } from "@/components/bottom-nav"
import { MobileTopBar } from "@/components/mobile-top-bar"
import { MoreSheet } from "@/components/more-sheet"
import { OfflineBanner } from "@/components/offline-banner"
import { useSession } from "@/hooks/useSession"
import { useShortcuts } from "@/hooks/useShortcuts"
import { PageTitleContext } from "@/lib/page-title"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

// Laptop (`lg`, >= 1024 px) keeps the sidebar open by default ("persistent");
// tablet (768-1023 px) starts it icon-collapsed ("collapsible"). Resolved once
// at mount so the first paint already matches the viewport (no layout flash).
function getDefaultSidebarOpen(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return true
  }

  return window.matchMedia("(min-width: 1024px)").matches
}

/**
 * Responsive app shell.
 * - Phone (< 768 px): native-app layout — compact top bar with collapsing
 *   large titles, bottom tab bar, "Mehr" sheet for everything else.
 * - Tablet/laptop: inset sidebar (icon-collapsed on tablet) next to a
 *   floating content panel.
 */
export function AppShell() {
  const [open, setOpen] = useState(getDefaultSidebarOpen)
  // Once the user toggles the sidebar, the viewport no longer overrides it.
  const userToggled = useRef(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [largeTitleHidden, setLargeTitleHidden] = useState(false)
  const { user } = useSession()
  useShortcuts(user?.role)

  const pageTitle = useMemo(
    () => ({ largeTitleHidden, setLargeTitleHidden }),
    [largeTitleHidden],
  )

  // Keep the sidebar in sync when the viewport crosses the laptop boundary
  // (>= 1024 px) after mount, so a tablet -> laptop resize becomes persistent.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return
    }

    const mql = window.matchMedia("(min-width: 1024px)")
    const onChange = (event: MediaQueryListEvent) => {
      if (userToggled.current) {
        return
      }
      setOpen(event.matches)
    }

    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return (
    <PageTitleContext.Provider value={pageTitle}>
      <SidebarProvider
        open={open}
        onOpenChange={(nextOpen) => {
          userToggled.current = true
          setOpen(nextOpen)
        }}
      >
        <TooltipProvider delay={300}>
          <AppSidebar />
          <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-[0_1px_2px_rgb(24_32_58/0.06),0_0_0_1px_var(--border)]">
            <MobileTopBar onOpenMore={() => setMoreOpen(true)} />
            <OfflineBanner />
            <div className="flex-1 px-4 pt-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 lg:px-10">
              <div className="mx-auto w-full max-w-5xl">
                <Outlet />
              </div>
            </div>
          </SidebarInset>
          <BottomNav moreOpen={moreOpen} onOpenMore={() => setMoreOpen(true)} />
          <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
        </TooltipProvider>
      </SidebarProvider>
    </PageTitleContext.Provider>
  )
}
