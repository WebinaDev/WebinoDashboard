"use client"

import { ChevronDown } from "lucide-react"
import { useState, type ReactNode } from "react"

import { PageShell } from "@/components/PageShell"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export function CafeAdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <PageShell title={title} description={description} actions={actions}>
      <div className="space-y-5">{children}</div>
    </PageShell>
  )
}

export function CafeSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("rounded-xl border", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-muted-foreground text-xs leading-relaxed">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  )
}

export function CafeAdvancedSection({
  title,
  description,
  showLabel,
  hideLabel,
  defaultOpen = false,
  children,
  className,
}: {
  title: string
  description?: string
  showLabel: string
  hideLabel: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-xl border", className)}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
        >
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm font-semibold">{title}</span>
            {description ? <span className="text-muted-foreground block text-xs leading-relaxed">{description}</span> : null}
          </span>
          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
            {open ? hideLabel : showLabel}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t px-4 py-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function CafeEmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center text-sm">
      <p>{message}</p>
    </div>
  )
}

export function CafeTabBar({
  tabs,
  active,
  onChange,
  labelFor,
}: {
  tabs: string[]
  active: string
  onChange: (tab: string) => void
  labelFor: (tab: string) => string
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b pb-3" role="tablist">
      {tabs.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => onChange(key)}
        >
          {labelFor(key)}
        </button>
      ))}
    </div>
  )
}

export const cafeSelectClass =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm [color-scheme:light] dark:[color-scheme:dark]"
