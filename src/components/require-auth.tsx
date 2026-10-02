import { Component, Fragment } from "react"
import type { ReactNode } from "react"
import { Navigate, Outlet } from "react-router"
import { ConvexError } from "convex/values"
import { LoaderCircle } from "lucide-react"
import { useSession } from "@/hooks/useSession"
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
  // Bumped after each recovery so the subtree remounts and session hooks
  // re-initialise from the (now cleared) localStorage.
  resetKey: number
  // Transient: set in the render phase so React does not retry the throwing
  // subtree before componentDidCatch schedules the remount.
  recovering: boolean
  unexpectedError: Error | null
}

// The `me` query throws ConvexError("Invalid or expired session") for stale
// tokens (expired session, reset dev database, deleted user), and useQuery
// rethrows query errors during render. Without a boundary that crashes the
// whole app to a blank screen with no recovery path.
function isExpiredSessionError(error: Error): boolean {
  const candidates = [error.message]
  if (error instanceof ConvexError && typeof error.data === "string") {
    candidates.push(error.data)
  }
  return candidates.some((text) => text.includes("Invalid or expired session"))
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
    error: Error,
  ): Partial<SessionErrorBoundaryState> | null {
    if (isExpiredSessionError(error)) {
      return { recovering: true }
    }
    return { unexpectedError: error }
  }

  componentDidCatch(error: Error): void {
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
