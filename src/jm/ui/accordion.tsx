"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export const JmAccordion = AccordionPrimitive.Root;

export const JmAccordionItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border-b border-[var(--jm-border)]", className)}
    {...props}
  />
));
JmAccordionItem.displayName = "JmAccordionItem";

export const JmAccordionHeader = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentProps<typeof AccordionPrimitive.Header>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Header
    ref={ref}
    className={cn("flex", className)}
    {...props}
  />
));
JmAccordionHeader.displayName = "JmAccordionHeader";

export const JmAccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Trigger
    ref={ref}
    className={cn(
      "group/jm-acc flex w-full items-center justify-between gap-3 py-3 text-left text-jm-base font-medium text-[var(--jm-text)] outline-none transition-colors hover:text-[var(--jm-text)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronDown className="size-4 shrink-0 text-[var(--jm-text-muted)] transition-transform duration-200 group-data-[panel-open]/jm-acc:rotate-180" />
  </AccordionPrimitive.Trigger>
));
JmAccordionTrigger.displayName = "JmAccordionTrigger";

export const JmAccordionPanel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof AccordionPrimitive.Panel>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Panel
    ref={ref}
    className={cn(
      "overflow-hidden text-jm-base text-[var(--jm-text-muted)] transition-[height] duration-200 ease-out h-[var(--accordion-panel-height)] data-[starting-style]:h-0 data-[ending-style]:h-0",
      className,
    )}
    {...props}
  >
    <div className="pb-3">{children}</div>
  </AccordionPrimitive.Panel>
));
JmAccordionPanel.displayName = "JmAccordionPanel";
