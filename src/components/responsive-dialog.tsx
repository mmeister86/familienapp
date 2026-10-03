import { useRef } from "react"
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { cn } from "cn"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"

type ResponsiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Visually hide the title (it stays the accessible name). */
  hideTitle?: boolean
  /** False while saving: no close button, no swipe-to-dismiss. */
  dismissible?: boolean
  /** Extra classes for the desktop dialog (e.g. `sm:max-w-lg`). */
  dialogClassName?: string
  children: ReactNode
}

// Drag distance (px) after which releasing the handle closes the sheet.
const DISMISS_DISTANCE = 96

/**
 * Bottom sheet on phones (grab handle, swipe down to close, safe-area aware),
 * centred dialog from `md` upwards. Esc, backdrop tap and focus trapping come
 * from the Base UI dialog primitive in both variants.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  dismissible = true,
  dialogClassName,
  children,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile()
  const popupRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; dy: number } | null>(null)

  const setOffset = (dy: number, animate: boolean): void => {
    const node = popupRef.current
    if (node === null) {
      return
    }
    node.style.transition = animate ? "transform 220ms var(--ease-ios)" : "none"
    node.style.transform = dy === 0 ? "" : `translateY(${String(dy)}px)`
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dismissible) {
      return
    }
    drag.current = { startY: event.clientY, dy: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) {
      return
    }
    // Only follow downward drags; resist upward ones.
    const dy = Math.max(0, event.clientY - drag.current.startY)
    drag.current.dy = dy
    setOffset(dy, false)
  }

  const onPointerEnd = (): void => {
    if (drag.current === null) {
      return
    }
    const { dy } = drag.current
    drag.current = null
    if (dy > DISMISS_DISTANCE) {
      onOpenChange(false)
      // Reset after the close animation so a re-open starts in place.
      window.setTimeout(() => setOffset(0, false), 250)
    } else {
      setOffset(0, true)
    }
  }

  const handleOpenChange = (next: boolean): void => {
    if (!next && !dismissible) {
      return
    }
    onOpenChange(next)
  }

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          ref={popupRef}
          // Focus the sheet itself, not its first field: on phones that would
          // pop the keyboard over the sheet before the user chose a field.
          initialFocus={popupRef}
          side="bottom"
          showCloseButton={false}
          className="max-h-[92dvh] gap-0 rounded-t-[1.75rem] outline-none bg-background pb-safe duration-300 ease-(--ease-ios) data-[side=bottom]:data-open:slide-in-from-bottom-full data-[side=bottom]:data-closed:slide-out-to-bottom-full"
        >
          <div
            className="flex shrink-0 cursor-grab touch-none flex-col items-center px-5 pt-2.5 pb-3 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <span
              aria-hidden="true"
              className="mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/25"
            />
            <SheetTitle
              className={cn(
                "w-full text-center text-[1.0625rem] font-semibold",
                hideTitle && "sr-only",
              )}
            >
              {title}
            </SheetTitle>
            {description !== undefined ? (
              <SheetDescription className="mt-0.5 w-full text-center text-sm">
                {description}
              </SheetDescription>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={dismissible}
        className={cn(
          "max-h-[90vh] gap-5 overflow-y-auto rounded-2xl p-6 sm:max-w-md",
          dialogClassName,
        )}
      >
        <DialogHeader className={cn(hideTitle && "sr-only")}>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {title}
          </DialogTitle>
          {description !== undefined ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
