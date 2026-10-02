import { useEffect } from "react"
import { useNavigate } from "react-router"

// Time window for the second key of a `g` sequence (ms).
const SEQUENCE_TIMEOUT_MS = 800

// Global keyboard shortcuts (mounted once in AppShell):
// - `n`: new task (parents only, navigates to /tasks and opens the editor)
// - `g` then `h`/`o`/`a`: go to Today/Overview/Approvals
// Ignored while typing (input/textarea/select/contentEditable), while a
// dialog/sheet is open (except Esc, which the primitives handle), and with
// modifier keys held.
export function useShortcuts(role: "parent" | "child" | undefined): void {
  const navigate = useNavigate()

  useEffect(() => {
    let pendingG = false
    let timer: number | null = null

    const clearPendingG = (): void => {
      pendingG = false
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      const target = event.target
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      if (typing) {
        return
      }
      if (document.querySelector('[role="dialog"]') !== null) {
        return
      }

      if (pendingG) {
        const second = event.key
        clearPendingG()
        if (second === "h") {
          navigate("/")
        } else if (second === "o") {
          navigate("/overview")
        } else if (second === "a") {
          navigate("/approvals")
        }
        return
      }

      if (event.key === "g") {
        pendingG = true
        timer = window.setTimeout(clearPendingG, SEQUENCE_TIMEOUT_MS)
        return
      }

      if (event.key === "n" && role === "parent") {
        event.preventDefault()
        navigate("/tasks", { state: { openNewTask: true } })
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [navigate, role])
}
