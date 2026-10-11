import { X } from "lucide-react"
import { cn } from "cn"
import type { Toast, ToastKind } from "@/hooks/useToasts"

const DOT: Record<ToastKind, string> = {
  success: "bg-green-500",
  error: "bg-destructive",
  info: "bg-primary",
}

export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  if (toasts.length === 0) {
    return null
  }
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-border bg-popover p-3.5 text-sm text-popover-foreground shadow-lg"
        >
          <span
            aria-hidden="true"
            className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[toast.kind])}
          />
          <span className="min-w-0 flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Schließen"
            className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
