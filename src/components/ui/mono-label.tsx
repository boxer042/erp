import * as React from "react"

import { cn } from "@/lib/utils"

function MonoLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="mono-label"
      className={cn(
        "font-mono text-[12px] leading-none uppercase tracking-[0.1em] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { MonoLabel }
