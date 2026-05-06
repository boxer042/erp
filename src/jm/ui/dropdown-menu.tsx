"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export const JmDropdownMenu = MenuPrimitive.Root;
export const JmDropdownMenuTrigger = MenuPrimitive.Trigger;
export const JmDropdownMenuGroup = MenuPrimitive.Group;
export const JmDropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export const JmDropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.Popup> & {
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    sideOffset?: number;
  }
>(({ className, side = "bottom", align = "end", sideOffset = 6, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Positioner
      side={side}
      align={align}
      sideOffset={sideOffset}
      className="isolate z-50"
    >
      <MenuPrimitive.Popup
        ref={ref}
        data-jm-scope
        className={cn(
          "z-50 min-w-[180px] overflow-hidden rounded-xl bg-[var(--jm-surface)] p-1 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </MenuPrimitive.Portal>
));
JmDropdownMenuContent.displayName = "JmDropdownMenuContent";

export const JmDropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.Item> & {
    danger?: boolean;
  }
>(({ className, danger, ...props }, ref) => (
  <MenuPrimitive.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-jm-sm outline-none transition-colors data-[highlighted]:bg-[var(--jm-surface-muted)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      danger
        ? "text-[var(--jm-danger-fg)] data-[highlighted]:bg-[var(--jm-danger-bg)]"
        : "text-[var(--jm-text)]",
      className,
    )}
    {...props}
  />
));
JmDropdownMenuItem.displayName = "JmDropdownMenuItem";

export const JmDropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Separator
    ref={ref}
    className={cn("my-1 h-px bg-[var(--jm-border)]", className)}
    {...props}
  />
));
JmDropdownMenuSeparator.displayName = "JmDropdownMenuSeparator";

export const JmDropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.GroupLabel>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.GroupLabel
    ref={ref}
    className={cn(
      "px-3 py-1.5 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]",
      className,
    )}
    {...props}
  />
));
JmDropdownMenuLabel.displayName = "JmDropdownMenuLabel";

export const JmDropdownMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-jm-sm outline-none transition-colors data-[highlighted]:bg-[var(--jm-surface-muted)]",
      className,
    )}
    {...props}
  >
    <span className="flex size-4 items-center justify-center">
      <MenuPrimitive.CheckboxItemIndicator>
        <Check className="size-4" strokeWidth={2.5} />
      </MenuPrimitive.CheckboxItemIndicator>
    </span>
    {children}
  </MenuPrimitive.CheckboxItem>
));
JmDropdownMenuCheckboxItem.displayName = "JmDropdownMenuCheckboxItem";

export const JmDropdownMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-jm-sm outline-none transition-colors data-[highlighted]:bg-[var(--jm-surface-muted)]",
      className,
    )}
    {...props}
  >
    <span className="flex size-4 items-center justify-center">
      <MenuPrimitive.RadioItemIndicator>
        <span className="size-2 rounded-full bg-[var(--jm-action)]" />
      </MenuPrimitive.RadioItemIndicator>
    </span>
    {children}
  </MenuPrimitive.RadioItem>
));
JmDropdownMenuRadioItem.displayName = "JmDropdownMenuRadioItem";

export const JmDropdownMenuSubmenu = MenuPrimitive.SubmenuRoot;
export const JmDropdownMenuSubmenuTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.SubmenuTrigger
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-jm-sm text-[var(--jm-text)] outline-none transition-colors data-[highlighted]:bg-[var(--jm-surface-muted)] data-[popup-open]:bg-[var(--jm-surface-muted)]",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="size-4 text-[var(--jm-text-muted)]" />
  </MenuPrimitive.SubmenuTrigger>
));
JmDropdownMenuSubmenuTrigger.displayName = "JmDropdownMenuSubmenuTrigger";
