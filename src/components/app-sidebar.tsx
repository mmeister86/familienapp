import { House, LogOut } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useSession } from "@/hooks/useSession"
import { isNavItemActive, isNavItemVisible, navItems } from "@/lib/nav"

/**
 * Persistent sidebar for tablet (`md`) and laptop (`lg`) layouts; on phones
 * the same content renders inside the sidebar sheet (opened via the header
 * trigger), so the footer logout stays reachable at 390 px.
 */
export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useSession()
  // Unknown/loading role renders no destinations (see isNavItemVisible) so
  // parent items never flash to kids while the session resolves.
  const visibleItems = navItems.filter((item) =>
    isNavItemVisible(item, user?.role),
  )

  const handleLogout = async (): Promise<void> => {
    await logout()
    navigate("/login")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-10 items-center gap-2 px-2 text-base font-semibold group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <House className="size-5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            Familienapp
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const active = isNavItemActive(item, pathname)

                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={active}
                      aria-current={active ? "page" : undefined}
                      tooltip={item.title}
                      render={<Link to={item.url} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {user ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full border text-lg"
                style={{ borderColor: user.color }}
              >
                {user.emoji}
              </span>
              <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-sm font-medium">
                  {user.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user.role === "parent" ? "Elternteil" : "Kind"}
                </span>
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              className="justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <LogOut aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">
                Abmelden
              </span>
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}
