import { useCallback, useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useSession } from "@/hooks/useSession"
import {
  getPushSubscription,
  requestPushPermission,
  subscribeBrowser,
  toBase64Url,
  unsubscribeBrowser,
} from "@/lib/push"

export type NotificationSettingsState = {
  /** Server has no VAPID key configured. */
  notConfigured: boolean
  /** Browser lacks Service Worker / Push support. */
  unsupported: boolean
  /** null = still checking this device. */
  deviceSubscribed: boolean | null
  busy: boolean
  error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Web push state for THIS device. Browser plumbing lives in src/lib/push.ts;
 * this hook glues it to the push.* Convex functions and produces German
 * status/error copy. The status is checked on mount (`active`) and can be
 * refreshed when a settings surface opens.
 */
export function useNotificationSettings(
  active: boolean,
): NotificationSettingsState {
  const { token } = useSession()
  const config = useQuery(api.push.config, token && active ? { token } : "skip")
  const subscribeMutation = useMutation(api.push.subscribe)
  const unsubscribeMutation = useMutation(api.push.unsubscribe)

  const [deviceSubscribed, setDeviceSubscribed] = useState<boolean | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const subscription = await getPushSubscription()
      setDeviceSubscribed(subscription !== null)
      setUnsupported(false)
    } catch {
      setUnsupported(true)
      setDeviceSubscribed(null)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      return
    }
    let cancelled = false
    void getPushSubscription()
      .then((subscription) => {
        if (!cancelled) {
          setDeviceSubscribed(subscription !== null)
          setUnsupported(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnsupported(true)
          setDeviceSubscribed(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [active])

  const enable = async (): Promise<void> => {
    const vapidPublicKey = config?.vapidPublicKey
    if (
      busy ||
      token === null ||
      vapidPublicKey === undefined ||
      vapidPublicKey === null
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const granted = await requestPushPermission()
      if (!granted) {
        setError(
          "Benachrichtigungen sind blockiert. Erlaube sie in den Browser-Einstellungen.",
        )
        return
      }
      const subscription = await subscribeBrowser(vapidPublicKey)
      const p256dh = subscription.getKey("p256dh")
      const auth = subscription.getKey("auth")
      if (p256dh === null || auth === null) {
        setError(
          "Die Anmeldung beim Benachrichtigungsdienst ist fehlgeschlagen.",
        )
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

  return {
    notConfigured: config?.vapidPublicKey === null,
    unsupported,
    deviceSubscribed,
    busy,
    error,
    enable,
    disable,
    refresh,
  }
}
