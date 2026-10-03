import { useState } from "react"
import { cn } from "cn"
import { Bell } from "lucide-react"
import { ListGroup, ListRow } from "@/components/list"
import { Switch } from "@/components/switch"
import { ResponsiveDialog } from "@/components/responsive-dialog"
import { Button } from "@/components/ui/button"
import { useNotificationSettings } from "@/hooks/useNotificationSettings"

/**
 * Push notifications for THIS device as a grouped-list row with a switch.
 * Used inside the phone "Mehr" sheet and the desktop settings dialog.
 */
export function NotificationSettingsGroup({ active }: { active: boolean }) {
  const settings = useNotificationSettings(active)

  let detail: string
  if (settings.notConfigured) {
    detail = "Auf dem Server nicht eingerichtet"
  } else if (settings.unsupported) {
    detail = "Von diesem Browser nicht unterstützt"
  } else if (settings.deviceSubscribed === null) {
    detail = "Status wird geprüft …"
  } else {
    detail = settings.deviceSubscribed
      ? "Auf diesem Gerät aktiv"
      : "Auf diesem Gerät aus"
  }

  const available =
    !settings.notConfigured &&
    !settings.unsupported &&
    settings.deviceSubscribed !== null

  return (
    <ListGroup
      footer={
        settings.error ??
        "Auf dem iPhone funktionieren Mitteilungen nur, wenn die App auf dem Home-Bildschirm liegt."
      }
    >
      <ListRow>
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"
        >
          <Bell className="size-[1.1rem]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.9375rem] font-medium">Mitteilungen</span>
          <span className="truncate text-sm text-muted-foreground">
            {detail}
          </span>
        </span>
        {available ? (
          <Switch
            label="Mitteilungen auf diesem Gerät"
            checked={settings.deviceSubscribed === true}
            disabled={settings.busy}
            onCheckedChange={(next) =>
              void (next ? settings.enable() : settings.disable())
            }
          />
        ) : null}
      </ListRow>
      {settings.error !== null ? (
        <li className="sr-only" role="alert">
          {settings.error}
        </li>
      ) : null}
    </ListGroup>
  )
}

/** Desktop: bell button that opens the notification settings. */
export function NotificationSettingsButton({
  className,
}: {
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Mitteilungen"
        className={cn("size-9", className)}
        onClick={() => setOpen(true)}
      >
        <Bell aria-hidden="true" className="size-[1.1rem]" />
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Mitteilungen"
        description="Erhalte Hinweise zu Aufgaben und Freigaben auf diesem Gerät."
      >
        {open ? <NotificationSettingsGroup active={open} /> : null}
      </ResponsiveDialog>
    </>
  )
}
