import { LogOut } from "lucide-react"
import { useNavigate } from "react-router"
import { Avatar } from "@/components/avatar"
import { ListButtonRow, ListGroup, ListLinkRow } from "@/components/list"
import { NotificationSettingsGroup } from "@/components/notification-settings"
import { ResponsiveDialog } from "@/components/responsive-dialog"
import { useApprovalsCount } from "@/hooks/useApprovalsCount"
import { useSession } from "@/hooks/useSession"
import { moreItemsFor } from "@/lib/nav"

/**
 * Phone "Mehr" sheet: who is signed in, the destinations that do not fit the
 * tab bar, notification settings for this device and sign-out.
 */
export function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { user, logout } = useSession()
  const approvalsCount = useApprovalsCount()
  const items = moreItemsFor(user?.role)

  const close = (): void => onOpenChange(false)

  const handleLogout = async (): Promise<void> => {
    close()
    await logout()
    navigate("/login")
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mehr"
      hideTitle
    >
      <div className="flex flex-col gap-6">
        {user !== undefined ? (
          <div className="flex flex-col items-center gap-2 pt-1 text-center">
            <Avatar emoji={user.emoji} color={user.color} size="xl" />
            <div>
              <p className="text-xl font-bold tracking-tight">{user.name}</p>
              <p className="text-sm text-muted-foreground">
                {user.role === "parent" ? "Elternteil" : "Kind"}
              </p>
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <ListGroup>
            {items.map((item) => {
              const badge =
                item.url === "/approvals" && approvalsCount > 0
                  ? approvalsCount
                  : null
              return (
                <ListLinkRow
                  key={item.url}
                  to={item.url}
                  onClick={close}
                  icon={<item.icon />}
                  label={item.title}
                  trailing={
                    badge !== null ? (
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                        {badge}
                      </span>
                    ) : undefined
                  }
                />
              )
            })}
          </ListGroup>
        ) : null}

        {open ? <NotificationSettingsGroup active={open} /> : null}

        <ListGroup>
          <ListButtonRow
            onClick={() => void handleLogout()}
            icon={<LogOut />}
            label="Abmelden"
            destructive
          />
        </ListGroup>
      </div>
    </ResponsiveDialog>
  )
}
