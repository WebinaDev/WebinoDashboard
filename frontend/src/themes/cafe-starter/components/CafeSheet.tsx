"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"

/**
 * Cafe-scoped sheet: RTL-safe close button, translated labels, and per-skin placement
 * (bottom sheet on phones, side drawer or centered card on wide screens).
 *
 * Uses modal={false} so Radix RemoveScroll does not fight our scroll lock (that fight
 * is what jumps customer menus back to the top when opening a product).
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
  useBodyScrollLock(open)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        {/* Radix DialogOverlay is a no-op when modal={false}; paint our own scrim. */}
        {open ? (
          <div
            className="cafe-sheet-overlay"
            data-skin={skin}
            data-scheme={scheme}
            onClick={() => onOpenChange(false)}
            aria-hidden="true"
          />
        ) : null}
        <DialogPrimitive.Content
          className={cn("cafe-sheet", className)}
          data-placement={placement}
          data-skin={skin}
          data-scheme={scheme}
          aria-describedby={description ? undefined : undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={() => onOpenChange(false)}
          onPointerDownOutside={(e) => {
            e.preventDefault()
            onOpenChange(false)
          }}
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
