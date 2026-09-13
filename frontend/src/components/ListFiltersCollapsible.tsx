"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ListFiltersCollapsible({
  children,
  className,
  activeCount = 0,
  label = "Filters",
}: {
  children: ReactNode
  className?: string
  activeCount?: number
  label?: string
}) {
  const [open, setOpen] = useState(activeCount > 0)
  return (
    <div className={cn("rounded-lg border border-border bg-card/60 p-3 shadow-soft", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {label}
          {activeCount > 0 ? <span className="text-muted-foreground ms-2 text-xs">({activeCount})</span> : null}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {open ? <div className="pt-1">{children}</div> : null}
    </div>
  )
}
