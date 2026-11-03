"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function SmsSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  tone = "default",
}: {
  title?: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  tone?: "default" | "muted"
}) {
  const showHeader = Boolean(title || description || actions || Icon)
  return (
    <section
      className={cn(
        "rounded-xl border border-border/80 shadow-soft",
        tone === "muted" ? "bg-muted/20" : "bg-card",
        className,
      )}
    >
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4" />
              </span>
            ) : null}
            <div className="min-w-0 space-y-0.5">
              {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
              {description ? <p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function SmsTwoColumn({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("grid gap-4 lg:grid-cols-2 lg:gap-6", className)}>{children}</div>
}

export function SmsEmptyState({
  message,
  hint,
  action,
}: {
  message: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center text-sm">
      <p className="font-medium text-foreground/80">{message}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed">{hint}</p> : null}
      {action}
    </div>
  )
}

export function SmsStatChip({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/80 px-3 py-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function SmsPreviewBubble({
  children,
  meta,
  empty,
}: {
  children?: ReactNode
  meta?: ReactNode
  empty?: string
}) {
  return (
    <div className="min-h-[11rem] space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-4">
      {children ? (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
      ) : empty ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : null}
      {meta ? <div className="text-muted-foreground border-t border-border/50 pt-2 text-xs">{meta}</div> : null}
    </div>
  )
}
