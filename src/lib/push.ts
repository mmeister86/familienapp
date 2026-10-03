// Browser-side Web Push helpers: base64url conversion for VAPID keys and
// subscription management against the service worker registration. The pure
// conversion helpers are unit tested; the browser functions guard on
// `navigator` availability and throw German errors for the settings UI.

// Decode an unpadded (or padded) base64url string — the applicationServerKey
// format served by `push.config`.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padded = base64String.padEnd(
    base64String.length + ((4 - (base64String.length % 4)) % 4),
    "=",
  )
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Encode raw key material (PushSubscription.getKey results) as base64url —
// the format `push.subscribe` stores.
export function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function assertPushSupported(): ServiceWorkerContainer {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    typeof window === "undefined" ||
    !("PushManager" in window) ||
    typeof Notification === "undefined"
  ) {
    throw new Error(
      "Benachrichtigungen werden von diesem Browser nicht unterstützt.",
    )
  }
  return navigator.serviceWorker
}

// The current push subscription of this browser, or null.
export async function getPushSubscription(): Promise<PushSubscription | null> {
  const registration = await assertPushSupported().ready
  return await registration.pushManager.getSubscription()
}

// Ask the user for notification permission. Resolves false when denied
// (the caller shows a "blocked" message; a hard "denied" state is surfaced
// the same way).
export async function requestPushPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") {
    return false
  }
  if (Notification.permission === "granted") {
    return true
  }
  const permission = await Notification.requestPermission()
  return permission === "granted"
}

// Subscribe this browser to push with the server's VAPID public key.
export async function subscribeBrowser(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const registration = await assertPushSupported().ready
  return await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })
}

// Unsubscribe this browser. Returns false when there was nothing to remove.
export async function unsubscribeBrowser(
  subscription: PushSubscription,
): Promise<boolean> {
  return await subscription.unsubscribe()
}
