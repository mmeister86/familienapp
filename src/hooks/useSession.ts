import { useCallback, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { ConvexError } from "convex/values"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
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

// Map backend login failures to German UI messages. The Convex client
// rethrows server ConvexErrors with the data preserved, but the message may
// carry a prefix, so match on substrings of both.
function toLoginErrorMessage(error: unknown): string {
  const candidates: string[] = []
  if (error instanceof ConvexError) {
    candidates.push(String(error.data ?? ""), error.message)
  } else if (error instanceof Error) {
    candidates.push(error.message)
  }
  const haystack = candidates.join(" ")
  if (haystack.includes("Account locked")) {
    return "Konto ist gesperrt. Bitte in 15 Minuten erneut versuchen."
  }
  if (haystack.includes("Invalid PIN")) {
    return "Falsche PIN, bitte erneut versuchen."
  }
  return "Anmeldung fehlgeschlagen. Bitte erneut versuchen."
}

// Token-based session against the Convex auth functions. The token is kept in
// React state (lazily initialised from localStorage) and the user profile is
// loaded reactively via the `me` query.
export function useSession(): UseSessionResult {
  const [token, setToken] = useState<string | null>(() => getSessionToken())
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
      setToken(sessionToken)
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
    setToken(null)
  }, [token, logoutMutation])

  // No token: known-unauthenticated without a backend roundtrip. Token
  // present but no `me` yet: the query is still loading.
  const status: SessionStatus =
    token === null ? "unauthenticated" : me === undefined ? "loading" : "authenticated"

  return { user: me, token, status, login, logout }
}
