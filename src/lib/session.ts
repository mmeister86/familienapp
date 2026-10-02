import { useSyncExternalStore } from "react"

// Session token persistence. This key is the ONLY thing the app stores in
// localStorage: the token identifies the Convex session, everything else
// (user profile, PIN state) lives in React state or on the server.
export const SESSION_STORAGE_KEY = "familienapp:token"

type TokenListener = () => void

// Module-level subscribers so every useSession() instance observes the same
// token without prop drilling or relying on remounts.
const tokenListeners = new Set<TokenListener>()

function notifyTokenListeners(): void {
  for (const listener of tokenListeners) {
    listener()
  }
}

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY)
}

export function setSessionToken(token: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, token)
  notifyTokenListeners()
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
  notifyTokenListeners()
}

function subscribeToSessionToken(listener: TokenListener): () => void {
  tokenListeners.add(listener)
  // Cross-tab sync: `storage` fires in every OTHER tab when the key changes.
  const onStorage = (event: StorageEvent): void => {
    if (event.key === SESSION_STORAGE_KEY) {
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener("storage", onStorage)
    tokenListeners.delete(listener)
  }
}

// Shared token subscription for useSession(). The snapshot is a string
// primitive (or null), so useSyncExternalStore compares by value: no
// tearing, no redundant renders.
export function useSessionToken(): string | null {
  return useSyncExternalStore(subscribeToSessionToken, getSessionToken)
}
