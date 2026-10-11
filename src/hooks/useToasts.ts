import { useCallback, useRef, useState } from "react"

export type ToastKind = "success" | "error" | "info"

export type Toast = {
  id: number
  kind: ToastKind
  text: string
}

/**
 * Minimal toaster state: stacked messages with auto-dismiss. Deliberately
 * not sonner: four text-only cases do not justify a dependency (+ its
 * Next.js-oriented companion packages).
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (kind: ToastKind, text: string, ttlMs = 5000) => {
      idRef.current += 1
      const id = idRef.current
      setToasts((prev) => [...prev.slice(-2), { id, kind, text }])
      window.setTimeout(() => dismiss(id), ttlMs)
    },
    [dismiss],
  )

  return { toasts, notify, dismiss }
}
