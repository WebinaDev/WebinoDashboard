"use client"

import { cn } from "@/lib/utils"

export type StatusCount = { slug: string; label: string; count: number }

export function OrderStatusTabs({
  counts,
  active,
  onChange,
}: {
  counts: StatusCount[]
  active: string
  onChange: (slug: string) => void
}) {
  if (counts.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-3">
      {counts.map((item, idx) => {
        const isActive = active === item.slug || (active === "" && item.slug === "all")
        return (
          <span key={item.slug} className="inline-flex items-center gap-1">
            {idx > 0 ? <span className="text-muted-foreground px-1">|</span> : null}
            <button
              type="button"
              className={cn(
                "rounded-md px-2 py-1 text-sm transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onChange(item.slug === "all" ? "" : item.slug)}
            >
              {item.label} <span className="opacity-80">({item.count})</span>
            </button>
          </span>
        )
      })}
    </div>
  )
}
