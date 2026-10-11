import type { ReactNode } from "react"
import { Navigate } from "react-router"
import { useSession } from "@/hooks/useSession"
import { useIsLaptop } from "@/hooks/useIsLaptop"

// Route guard for parent-only, laptop-only pages (currently /layouts).
// Anything else redirects silently to /: kids never learn the page exists,
// and narrow viewports get no broken desktop layout. Drafts live in Convex,
// so an interrupted session loses nothing.
export function ParentDesktopOnly({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const isLaptop = useIsLaptop()

  if (user?.role !== "parent" || !isLaptop) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
