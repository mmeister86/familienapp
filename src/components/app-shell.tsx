import { useEffect, useRef, useState } from "react"
import { Outlet } from "react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { BottomNav } from "@/components/bottom-nav"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

// Laptop (`lg`, >= 1024 px) keeps the sidebar open by default ("persistent");
// tablet (768-1023 px) starts it icon-collapsed ("collapsible"). Resolved once
// at mount so the first paint already matches the viewport (no layout flash).
function getDefaultSidebarOpen(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true
  }

  return window.matchMedia("(min-width: 1024px)").matches
}

/** Responsive app shell: bottom nav on phone, sidebar from tablet upwards. */
export function AppShell() {
  const [open, setOpen] = useState(getDefaultSidebarOpen)
  // Once the user toggles the sidebar, the viewport no longer overrides it.
  const userToggled = useRef(false)

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
    <SidebarProvider
      open={open}
      onOpenChange={(nextOpen) => {
        userToggled.current = true
        setOpen(nextOpen)
      }}
    >
      <TooltipProvider delay={300}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="hidden md:inline-flex" />
            <span className="text-base font-semibold lg:hidden">
              Familienapp
            </span>
          </header>
          <div className="flex-1 px-4 py-6 pb-24 md:pb-6">
            <div className="mx-auto w-full max-w-5xl">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
        <BottomNav />
      </TooltipProvider>
    </SidebarProvider>
  )
}
