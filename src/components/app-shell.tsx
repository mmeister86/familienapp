import { Outlet } from "react-router"
import { AppSidebar } from "@/components/app-sidebar"
import { BottomNav } from "@/components/bottom-nav"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

/** Responsive app shell: bottom nav on phone, sidebar from tablet upwards. */
export function AppShell() {
  return (
    <SidebarProvider>
      <TooltipProvider delay={300}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="hidden md:inline-flex" />
            <span className="text-base font-semibold md:hidden">
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
