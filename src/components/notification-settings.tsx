import { useCallback, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Bell } from "lucide-react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSession } from "@/hooks/useSession"
import {
  getPushSubscription,
  requestPushPermission,
  subscribeBrowser,
  toBase64Url,
  unsubscribeBrowser,
} from "@/lib/push"

// Header bell + dialog: enable/disable web push notifications for THIS
// device. Browser plumbing lives in src/lib/push.ts; this component glues it
// to the push.* Convex functions and renders German status/error copy.
export function NotificationSettings() {
  const { token } = useSession()
  const config = useQuery(api.push.config, token ? { token } : "skip")
  const subscribeMutation = useMutation(api.push.subscribe)
  const unsubscribeMutation = useMutation(api.push.unsubscribe)

  // null = still checking; the status line only renders for a known state.
  const [open, setOpen] = useState(false)
  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const subscription = await getPushSubscription()
      setDeviceSubscribed(subscription !== null)
      setUnsupported(false)
    } catch {
      setUnsupported(true)
      setDeviceSubscribed(null)
    }
  }, [])

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (nextOpen) {
      setError(null)
      void refreshStatus()
    }
  }

  const enable = async (): Promise<void> => {
    if (busy || token === null || config?.vapidPublicKey === undefined) {
      return
    }
    if (config?.vapidPublicKey === null) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const granted = await requestPushPermission()
      if (!granted) {
        setError(
          "Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.",
        )
        return
      }
      const subscription = await subscribeBrowser(config.vapidPublicKey)
      const p256dh = subscription.getKey("p256dh")
      const auth = subscription.getKey("auth")
      if (p256dh === null || auth === null) {
        setError("Die Anmeldung beim Benachrichtigungsdienst ist fehlgeschlagen.")
        return
      }
      await subscribeMutation({
        token,
        endpoint: subscription.endpoint,
        p256dh: toBase64Url(p256dh),
        auth: toBase64Url(auth),
        userAgent: navigator.userAgent,
      })
      setDeviceSubscribed(true)
    } catch (pushError) {
      setError(
        pushError instanceof Error
          ? pushError.message
          : "Aktivieren ist fehlgeschlagen. Bitte erneut versuchen.",
      )
    } finally {
      setBusy(false)
    }
  }

  const disable = async (): Promise<void> => {
    if (busy || token === null) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const subscription = await getPushSubscription()
      if (subscription !== null) {
        await unsubscribeBrowser(subscription)
        await unsubscribeMutation({ token, endpoint: subscription.endpoint })
      }
      setDeviceSubscribed(false)
    } catch {
      setError("Deaktivieren ist fehlgeschlagen. Bitte erneut versuchen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Benachrichtigungen"
        className="size-8"
        onClick={() => handleOpenChange(true)}
      >
        <Bell aria-hidden="true" className="size-4" />
      </Button>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Benachrichtigungen</DialogTitle>
          <DialogDescription>
            Erhalte Mitteilungen auf diesem Gerät.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {config?.vapidPublicKey === null ? (
            <p className="text-sm text-muted-foreground">
              Benachrichtigungen sind auf dem Server nicht konfiguriert.
            </p>
          ) : unsupported ? (
            <p className="text-sm text-muted-foreground">
              Benachrichtigungen werden von diesem Browser nicht unterstützt.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {deviceSubscribed === null
                  ? "Status wird geprüft …"
                  : deviceSubscribed
                    ? "Auf diesem Gerät aktiviert."
                    : "Auf diesem Gerät nicht aktiviert."}
              </p>
              {deviceSubscribed !== null ? (
                <Button
                  type="button"
                  onClick={() => void (deviceSubscribed ? disable() : enable())}
                  disabled={busy}
                >
                  {deviceSubscribed ? "Deaktivieren" : "Aktivieren"}
                </Button>
              ) : null}
            </>
          )}
          {error !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
