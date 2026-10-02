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
        "disabled:bg-secondary-200/10 block w-full rounded-lg border border-border bg-input px-3 py-[.8rem] text-base placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:pointer-events-none dark:focus:border-primary",
        className
      )}
      {...props}
    />
  )
}

export { Input }
