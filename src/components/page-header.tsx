import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { cn } from "cn"
import { usePageTitle } from "@/lib/page-title"

type PageHeaderProps = {
  title: string
  /** One short line under the title (date, progress, context). */
  subtitle?: ReactNode
  /** Buttons at the right of the title row. */
  actions?: ReactNode
  /** Rendered under the title row (e.g. a segmented switcher). */
  children?: ReactNode
  className?: string
}

/**
 * Page title block. On phones it is the iOS-style large title: once it
 * scrolls under the top bar, the bar fades in a compact copy of the title.
 * On tablet/laptop it is a plain heading row with the page actions.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  className,
}: PageHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { setLargeTitleHidden } = usePageTitle()

  useEffect(() => {
    const node = titleRef.current
    if (node === null || typeof IntersectionObserver === "undefined") {
      return
    }
    // The phone top bar is ~3rem plus the safe-area inset; a 64 px top margin
    // flips the state right as the title slides under it.
    const observer = new IntersectionObserver(
      ([entry]) => setLargeTitleHidden(!entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
      setLargeTitleHidden(false)
    }
  }, [setLargeTitleHidden])

  return (
    <header className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1
            ref={titleRef}
            className="text-[2.125rem] leading-[1.1] font-bold tracking-[-0.03em] text-balance md:text-[1.875rem]"
          >
            {title}
          </h1>
          {subtitle !== undefined ? (
            <p className="text-[0.9375rem] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions !== undefined ? (
          <div className="flex shrink-0 items-center gap-2 pb-0.5">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  )
}
