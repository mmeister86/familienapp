import { cn } from "cn"

/** iOS-style switch built on a native button (role="switch"). */
export function Switch({
  checked,
  disabled,
  onCheckedChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[1.9rem] w-[3.1rem] shrink-0 items-center rounded-full p-0.5 outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        checked ? "bg-success" : "bg-muted-foreground/25",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-[1.65rem] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.18)] transition-transform duration-200 ease-(--ease-ios)",
          checked && "translate-x-[1.2rem]",
        )}
      />
    </button>
  )
}
