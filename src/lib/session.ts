// Session token persistence. This key is the ONLY thing the app stores in
// localStorage: the token identifies the Convex session, everything else
// (user profile, PIN state) lives in React state or on the server.
export const SESSION_STORAGE_KEY = "familienapp:token"

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY)
}

export function setSessionToken(token: string): void {
  localStorage.setItem(SESSION_STORAGE_KEY, token)
}

export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}
