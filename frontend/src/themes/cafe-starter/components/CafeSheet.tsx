"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Cafe-scoped sheet: RTL-safe close button, translated labels, and per-skin placement
 * (bottom sheet on phones, side drawer or centered card on wide screens).
 */
export function CafeSheet({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  placement = "bottom",
  skin,
  scheme,
  className,
  children,
  trigger,
  hideTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  closeLabel: string
  placement?: "bottom" | "side" | "center"
  skin?: string
  scheme?: string
  className?: string
  children: ReactNode
  trigger?: ReactNode
  hideTitle?: boolean
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="cafe-sheet-overlay" data-skin={skin} />
        <DialogPrimitive.Content
          className={cn("cafe-sheet", className)}
          data-placement={placement}
          data-skin={skin}
          data-scheme={scheme}
          aria-describedby={description ? undefined : undefined}
        >
          <span className="cafe-sheet-grip" aria-hidden="true" />
          <DialogPrimitive.Title className={cn("cafe-sheet-title", hideTitle && "sr-only")}>{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="cafe-sheet-desc">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <DialogPrimitive.Close className="cafe-sheet-close" aria-label={closeLabel}>
            <X className="size-4" />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
