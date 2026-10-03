import { WifiOff } from "lucide-react"
import { useConvexConnectionState } from "convex/react"
import { isOffline } from "@/lib/connection"

// Amber strip below the header while the Convex WebSocket is down (only
// after the first successful connection, so a cold page load never flashes).
// Convex keeps retrying and replays missed updates, so no action is needed
// from the user — the banner is informational (role="status").
export function OfflineBanner() {
  const state = useConvexConnectionState()
  if (!isOffline(state)) {
    return null
  }

  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-amber-500/15 px-4 py-2 text-sm text-amber-800 dark:text-amber-200"
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      <span>
        Keine Verbindung. Änderungen werden automatisch synchronisiert, sobald
        die Verbindung wieder besteht.
      </span>
    </div>
  )
}
