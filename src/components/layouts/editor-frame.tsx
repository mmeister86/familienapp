import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * Frame of the scene editor: top bar, optional alert row, and a body with
 * widget library, workbench and inspector separated by hairlines. Below `xl`
 * the inspector moves under the library (two columns). Layout only.
 */
export function EditorFrame({
  topBar,
  alert,
  library,
  workbench,
  inspector,
}: {
  topBar: ReactNode
  alert?: ReactNode
  /** Null for scenes without a widget library (night). */
  library: ReactNode | null
  workbench: ReactNode
  inspector: ReactNode
}) {
  const hasLibrary = library !== null
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        {topBar}
      </div>
      {alert}
      <div
        className={cn(
          "grid",
          hasLibrary
            ? "grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]"
            : "grid-cols-[minmax(0,1fr)_18rem]",
        )}
      >
        {hasLibrary && (
          <div className="border-r border-border p-4">{library}</div>
        )}
        <div
          className={cn(
            "min-w-0 bg-muted/40 p-4 dark:bg-background/60",
            hasLibrary && "col-start-2 row-start-1 row-span-2 xl:row-span-1",
          )}
        >
          {workbench}
        </div>
        <div
          className={cn(
            "p-4",
            hasLibrary
              ? "col-start-1 row-start-2 border-t border-r border-border xl:col-start-3 xl:row-start-1 xl:border-t-0 xl:border-r-0 xl:border-l"
              : "border-l border-border",
          )}
        >
          {inspector}
        </div>
      </div>
    </div>
  )
}

/**
 * Width cap for the 9:16 canvas: at most 600px, narrower when the viewport is
 * too short to show the whole sheet (chrome above and below is OFFSET_PX),
 * never below 320px (the page scrolls instead).
 */
const CHROME_OFFSET_PX = 316

export function CanvasStage({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto w-full"
      style={{
        maxWidth: `min(600px, max(320px, calc((100dvh - ${CHROME_OFFSET_PX}px) * 9 / 16)))`,
      }}
    >
      {children}
    </div>
  )
}
