import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[loading=true]:cursor-wait disabled:not-data-[loading=true]:opacity-50 data-[loading=true]:opacity-60",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-foreground border-[var(--chart-3)] hover:bg-primary/80 hover:border-[var(--chart-4)] dark:bg-primary/85 dark:hover:bg-primary/60 dark:border-primary/40 [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background text-foreground hover:bg-muted hover:text-foreground hover:border-foreground/20 aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:text-foreground dark:hover:bg-input/50",
        secondary:
          "bg-foreground text-background border-foreground/40 hover:bg-foreground/85 hover:border-foreground/60 aria-expanded:bg-foreground aria-expanded:text-background",
        ghost:
          "border-transparent text-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/15 text-foreground border-destructive/50 hover:bg-destructive/25 hover:border-destructive/70 focus-visible:border-destructive/70 focus-visible:ring-destructive/20 dark:bg-destructive/40 dark:text-foreground dark:border-destructive/60 dark:hover:bg-destructive/55 dark:focus-visible:ring-destructive/40",
        warning:
          "bg-warning/20 text-foreground border-warning/60 hover:bg-warning/30 hover:border-warning/80 focus-visible:border-warning/80 focus-visible:ring-warning/20 dark:bg-warning/40 dark:text-foreground dark:border-warning/60 dark:hover:bg-warning/55",
        link: "text-primary border-transparent underline-offset-4 hover:underline dark:text-primary",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
