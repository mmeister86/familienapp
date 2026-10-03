import type { ComponentProps } from "react"

// third-party
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "block h-12 w-full rounded-xl border border-border bg-input px-3.5 text-base transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:ring-3 focus:ring-ring/20 focus:outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:h-11",
        className
      )}
      {...props}
    />
  )
}

export { Input }
