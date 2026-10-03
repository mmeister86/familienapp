import type { ComponentProps, ReactNode } from "react"
import { cn } from "cn"
import { ChevronRight } from "lucide-react"
import { Link } from "react-router"

/**
 * Grouped list ("inset grouped table"): one rounded surface with hairline
 * separators between rows, an optional heading above and a hint below. This
 * is the main list pattern of the app instead of one bordered card per row.
 */
export function ListGroup({
  title,
  titleId,
  trailing,
  footer,
  className,
  children,
}: {
  title?: ReactNode
  titleId?: string
  /** Small element at the right of the heading (count, action). */
  trailing?: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={title !== undefined ? titleId : undefined}
      className={cn("flex flex-col gap-2", className)}
    >
      {title !== undefined ? (
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2
            id={titleId}
            className="text-[0.9375rem] font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {trailing}
        </div>
      ) : null}
      <ul className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_0_0_var(--border),0_0_0_1px_var(--border)] [&>li+li]:border-t [&>li+li]:border-border">
        {children}
      </ul>
      {footer !== undefined ? (
        <p className="px-1 text-sm text-muted-foreground">{footer}</p>
      ) : null}
    </section>
  )
}

type RowContentProps = {
  icon?: ReactNode
  label: ReactNode
  detail?: ReactNode
  trailing?: ReactNode
  chevron?: boolean
  destructive?: boolean
}

function RowContent({
  icon,
  label,
  detail,
  trailing,
  chevron,
  destructive,
}: RowContentProps) {
  return (
    <>
      {icon !== undefined ? (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg]:size-[1.1rem]",
            destructive && "bg-destructive/10 text-destructive",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-[0.9375rem] font-medium",
            destructive && "text-destructive",
          )}
        >
          {label}
        </span>
        {detail !== undefined ? (
          <span className="truncate text-sm text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
      {trailing}
      {chevron ? (
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground/60"
        />
      ) : null}
    </>
  )
}

const rowClassName =
  "flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors focus-visible:bg-muted active:bg-muted md:hover:bg-muted/60"

/** Navigation row (react-router link) with a chevron. */
export function ListLinkRow({
  to,
  onClick,
  ...content
}: RowContentProps & { to: string; onClick?: () => void }) {
  return (
    <li>
      <Link to={to} onClick={onClick} className={rowClassName}>
        <RowContent chevron {...content} />
      </Link>
    </li>
  )
}

/** Action row (button). */
export function ListButtonRow({
  onClick,
  disabled,
  ...content
}: RowContentProps & { onClick: () => void; disabled?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(rowClassName, "disabled:opacity-50")}
      >
        <RowContent {...content} />
      </button>
    </li>
  )
}

/** Static row for arbitrary content (e.g. a label plus a switch). */
export function ListRow({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn("flex min-h-13 items-center gap-3 px-4 py-2.5", className)}
      {...props}
    />
  )
}
