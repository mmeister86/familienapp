import { useCallback } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  getAuthErrorCode,
} from "../../convex/lib/authErrors"
import {
  clearSessionToken,
  setSessionToken,
  useSessionToken,
} from "@/lib/session"

// Public profile of the signed-in user (no PIN or lockout fields).
// Mirrors the `me` query validator in convex/auth.ts.
export type SessionUser = {
  _id: Id<"users">
  slug: string
  name: string
  role: "parent" | "child"
  color: string
  emoji: string
}

export type SessionStatus = "loading" | "authenticated" | "unauthenticated"

export type UseSessionResult = {
  user: SessionUser | undefined
  token: string | null
  status: SessionStatus
  login: (slug: string, pin: string) => Promise<void>
  logout: () => Promise<void>
}

// Map backend login failures to German UI messages. Prefer the stable error
// code; fall back to the legacy Task 4 message substrings for errors whose
// structured data is unavailable.
function toLoginErrorMessage(error: unknown): string {
  const code = getAuthErrorCode(error)
  if (code === AUTH_ERROR_CODES.accountLocked) {
    return "Konto ist gesperrt. Bitte in 15 Minuten erneut versuchen."
  }
  if (code === AUTH_ERROR_CODES.invalidPin) {
    return "Falsche PIN, bitte erneut versuchen."
  }
  const message = error instanceof Error ? error.message : ""
  if (message.includes(AUTH_ERROR_MESSAGES.accountLocked)) {
    return "Konto ist gesperrt. Bitte in 15 Minuten erneut versuchen."
  }
  if (message.includes(AUTH_ERROR_MESSAGES.invalidPin)) {
    return "Falsche PIN, bitte erneut versuchen."
  }
  return "Anmeldung fehlgeschlagen. Bitte erneut versuchen."
}

// Token-based session against the Convex auth functions. The token lives in
// the shared session store, so login/logout in any instance (or another tab)
// updates every useSession() caller; the user profile loads reactively via
// the `me` query.
export function useSession(): UseSessionResult {
  const token = useSessionToken()
  const me = useQuery(api.auth.me, token ? { token } : "skip")
  const loginAction = useAction(api.auth.login)
  const logoutMutation = useMutation(api.auth.logout)

  const login = useCallback(
    async (slug: string, pin: string): Promise<void> => {
      let sessionToken: string
      try {
        const result = await loginAction({ slug, pin })
        sessionToken = result.token
      } catch (error) {
        throw new Error(toLoginErrorMessage(error), { cause: error })
      }
      setSessionToken(sessionToken)
    },
    [loginAction],
  )

  const logout = useCallback(async (): Promise<void> => {
    if (token !== null) {
      try {
        await logoutMutation({ token })
      } catch {
        // Best effort: the server session may already be gone (expired,
        // deleted, offline). Local sign-out below always runs.
      }
    }
    clearSessionToken()
  }, [token, logoutMutation])

  // No token: known-unauthenticated without a backend roundtrip. Token
  // present but no `me` yet: the query is still loading.
  const status: SessionStatus =
    token === null ? "unauthenticated" : me === undefined ? "loading" : "authenticated"

  return { user: me, token, status, login, logout }
}
