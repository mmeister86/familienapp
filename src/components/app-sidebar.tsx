import { House, LogOut } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router"
import { Avatar } from "@/components/avatar"
import { NotificationSettingsButton } from "@/components/notification-settings"
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
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useApprovalsCount } from "@/hooks/useApprovalsCount"
import { useSession } from "@/hooks/useSession"
import {
  NAV_GROUP_LABELS,
  NAV_GROUP_ORDER,
  isNavItemActive,
  isNavItemVisible,
  navItems,
} from "@/lib/nav"

/**
 * Inset sidebar for tablet (`md`, icon-collapsed) and laptop (`lg`,
 * expanded). Phones use the tab bar + "Mehr" sheet instead.
 */
export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useSession()
  const approvalsCount = useApprovalsCount()
  // Unknown/loading role renders no destinations (see isNavItemVisible) so
  // parent items never flash to kids while the session resolves.
  const groups = NAV_GROUP_ORDER.map((group) => ({
    group,
    items: navItems.filter(
      (item) => item.group === group && isNavItemVisible(item, user?.role),
    ),
  })).filter((entry) => entry.items.length > 0)

  const handleLogout = async (): Promise<void> => {
    await logout()
    navigate("/login")
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pt-3">
        <div className="flex h-10 items-center gap-2.5 px-1.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-[0.6rem] bg-primary text-primary-foreground group-data-[collapsible=icon]:hidden"
          >
            <House className="size-[1.05rem]" strokeWidth={2.4} />
          </span>
          <span className="flex-1 truncate text-[0.9375rem] font-bold tracking-tight group-data-[collapsible=icon]:hidden">
            Familienapp
          </span>
          <SidebarTrigger
            reverseIcon
            className="size-8 text-muted-foreground hover:text-foreground [&_svg]:size-[1.15rem]!"
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        {groups.map(({ group, items }) => (
          <SidebarGroup key={group} className="py-1.5">
            <SidebarGroupLabel className="text-[0.75rem] font-medium text-muted-foreground">
              {NAV_GROUP_LABELS[group]}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {items.map((item) => {
                  const active = isNavItemActive(item, pathname)
                  const showBadge =
                    item.url === "/approvals" && approvalsCount > 0

                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        isActive={active}
                        aria-current={active ? "page" : undefined}
                        aria-label={
                          showBadge
                            ? `Freigaben, ${String(approvalsCount)} offen`
                            : undefined
                        }
                        tooltip={item.title}
                        render={<Link to={item.url} />}
                        className="h-9 text-[0.875rem] text-sidebar-foreground/80 data-active:font-semibold data-active:text-sidebar-foreground data-active:shadow-[0_1px_2px_rgb(24_32_58/0.08),0_0_0_1px_var(--sidebar-border)] [&_svg]:size-[1.05rem]"
                      >
                        <item.icon strokeWidth={active ? 2.3 : 1.9} />
                        <span>{item.title}</span>
                        {showBadge ? (
                          <span
                            aria-hidden="true"
                            className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[0.7rem] font-semibold text-white tabular-nums group-data-[collapsible=icon]:hidden"
                          >
                            {approvalsCount}
                          </span>
                        ) : null}
                      </SidebarMenuButton>
                      {showBadge ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-destructive ring-2 ring-sidebar group-data-[collapsible=icon]:block"
                        />
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="pb-3">
        {user ? (
          <div className="flex items-center gap-2 rounded-xl p-1.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:p-0">
            <Avatar emoji={user.emoji} color={user.color} size="md" />
            <span className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">
                {user.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {user.role === "parent" ? "Elternteil" : "Kind"}
              </span>
            </span>
            <NotificationSettingsButton className="text-muted-foreground hover:text-foreground" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void handleLogout()}
              aria-label="Abmelden"
              title="Abmelden"
              className="size-9 text-muted-foreground hover:text-foreground"
            >
              <LogOut aria-hidden="true" className="size-[1.05rem]" />
            </Button>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  )
}
