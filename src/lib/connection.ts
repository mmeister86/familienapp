// True when the app has lost its Convex WebSocket connection after having
// been connected. State unknown (undefined) and the very first connect
// attempt are NOT offline — the banner must not flash on page load.
export function isOffline(
  state:
    | {
        hasEverConnected: boolean
        isWebSocketConnected: boolean
      }
    | undefined,
): boolean {
  if (state === undefined) {
    return false
  }
  return state.hasEverConnected && !state.isWebSocketConnected
}
