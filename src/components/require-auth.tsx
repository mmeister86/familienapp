import { Component, Fragment } from "react"
import type { ReactNode } from "react"
import { Navigate, Outlet } from "react-router"
import { LoaderCircle } from "lucide-react"
import { useSession } from "@/hooks/useSession"
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  getAuthErrorCode,
} from "../../convex/lib/authErrors"
import { clearSessionToken } from "@/lib/session"

// Route guard for the authenticated app shell. Loading shows a centered
// indicator (never the login form flashing), unauthenticated redirects to
// /login, authenticated renders the wrapped children (or a nested outlet).
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useSession()

  if (status === "loading") {
    return (
      <main className="flex min-h-svh items-center justify-center px-4">
        <div
          className="flex flex-col items-center gap-3"
          role="status"
          aria-label="Wird geladen"
        >
          <LoaderCircle
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Wird geladen …</p>
        </div>
      </main>
    )
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />
  }

  return children ?? <Outlet />
}

type SessionErrorBoundaryProps = {
  children: ReactNode
}

type SessionErrorBoundaryState = {
  // Bumped after each recovery so the errored subtree (which threw during
  // render) remounts fresh; the shared token store has already flipped every
  // session hook to unauthenticated, so the remount lands on the login flow.
  resetKey: number
  // Transient: set in the render phase so React does not retry the throwing
  // subtree before componentDidCatch schedules the remount.
  recovering: boolean
  unexpectedError: unknown
}

// The `me` query fails with the invalid-session code for stale tokens
// (expired session, reset dev database, deleted user), and useQuery rethrows
// query errors during render. Without a boundary that crashes the whole app
// to a blank screen with no recovery path.
function isExpiredSessionError(error: unknown): boolean {
  if (getAuthErrorCode(error) === AUTH_ERROR_CODES.invalidSession) {
    return true
  }
  // Legacy fallback: the Task 4 string message.
  return (
    error instanceof Error &&
    error.message.includes(AUTH_ERROR_MESSAGES.invalidSession)
  )
}

// App-wide guard mounted around the routes in App.tsx: a stale token clears
// the session and remounts into the unauthenticated flow (login screen)
// instead of crashing. Any other error is rethrown untouched.
export class SessionErrorBoundary extends Component<
  SessionErrorBoundaryProps,
  SessionErrorBoundaryState
> {
  constructor(props: SessionErrorBoundaryProps) {
    super(props)
    this.state = { resetKey: 0, recovering: false, unexpectedError: null }
  }

  static getDerivedStateFromError(
    error: unknown,
  ): Partial<SessionErrorBoundaryState> | null {
    if (isExpiredSessionError(error)) {
      return { recovering: true }
    }
    return { unexpectedError: error }
  }

  componentDidCatch(error: unknown): void {
    if (!isExpiredSessionError(error)) {
      return
    }
    clearSessionToken()
    this.setState((state) => ({
      resetKey: state.resetKey + 1,
      recovering: false,
    }))
  }

  render(): ReactNode {
    if (this.state.unexpectedError !== null) {
      throw this.state.unexpectedError
    }
    if (this.state.recovering) {
      return null
    }
    return (
      <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
    )
  }
}
