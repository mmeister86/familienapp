import { lazy, Suspense } from "react"
import { Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { ParentDesktopOnly } from "@/components/parent-desktop-only"
import { RequireAuth, SessionErrorBoundary } from "@/components/require-auth"
import { AnytimePage } from "@/pages/anytime"
import { ApprovalsPage } from "@/pages/approvals"
import { LoginPage } from "@/pages/login"
import { NotFoundPage } from "@/pages/not-found"
import { OverviewPage } from "@/pages/overview"
import { PointsPage } from "@/pages/points"
import { RewardsPage } from "@/pages/rewards"
import { TasksPage } from "@/pages/tasks"
import { TodayPage } from "@/pages/today"
import { UpcomingPage } from "@/pages/upcoming"

// The scene builder (and the animation library it uses) is only for the laptop-only /layouts route.
const LayoutsPage = lazy(() =>
  import("@/pages/layouts").then((module) => ({ default: module.LayoutsPage })),
)

export default function App() {
  return (
    <SessionErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<TodayPage />} />
          <Route path="/anytime" element={<AnytimePage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/rewards" element={<RewardsPage />} />
          <Route path="/points" element={<PointsPage />} />
          <Route
            path="/layouts"
            element={
              <ParentDesktopOnly>
                <Suspense fallback={null}>
                  <LayoutsPage />
                </Suspense>
              </ParentDesktopOnly>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionErrorBoundary>
  )
}
