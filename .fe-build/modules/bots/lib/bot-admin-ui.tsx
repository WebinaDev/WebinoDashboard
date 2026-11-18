"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function BotSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  id,
  badge,
}: {
  title?: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
  badge?: string
}) {
  const showHeader = Boolean(title || description || actions || Icon || badge)
  return (
    <section id={id} className={cn("rounded-xl border border-border/80 bg-card shadow-soft", className)}>
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4" />
              </span>
            ) : null}
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
                {badge ? <Badge variant="secondary">{badge}</Badge> : null}
              </div>
              {description ? (
                <p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">{description}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function BotTwoColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 lg:grid-cols-2 lg:gap-6", className)}>{children}</div>
}

export function BotComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <BotSection title={title} description={description} badge="…">
      <p className="text-muted-foreground text-sm">{description}</p>
    </BotSection>
  )
}

export const fieldClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
export const textareaClass = "border-input bg-background min-h-20 w-full rounded-md border p-2 text-sm"
